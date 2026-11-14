"""Real local retrieval over PSI metadata, records and page-cited NASA documents.

Ranking is relevance, never physical confidence. Numeric conditions are compared
in their actual units; unknown data is never imputed into a matching experiment.
"""
from __future__ import annotations

from collections import Counter
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import re
import threading
import unicodedata
import uuid

from backend.providers import AIProvider, ProviderError
from backend.vectorstore import MongoVectorStore, text_hash

INTENTS = {"prevention", "detection", "suppression", "post-fire", "terrestrial"}
INTENT_WORDS = {
    "prevention": "flammability ignition solid material flame spread prevention geometry oxygen",
    "detection": "smoke aerosol particle detection sensor detector alarm pyrolysis overheating",
    "suppression": "suppression extinguishment extinguish nitrogen nozzle fire safety",
    "post-fire": "cleanup filtration toxic contamination carbon monoxide combustion products spacecraft",
    "terrestrial": "terrestrial earth firefighter technology transfer smoke detector protective materials",
}
CATEGORY_INTENT = {
    "prevention": {"solid": 6, "large-scale": 5, "gas": 1, "droplet": 1},
    "detection": {"detection": 18, "large-scale": 3},
    "suppression": {"solid": 8, "large-scale": 7, "droplet": 2},
    "post-fire": {"large-scale": 9, "detection": 5},
    "terrestrial": {"detection": 5, "solid": 3, "large-scale": 2},
}
ALIASES = [
    ("fumaca smoke aerosol aerossol particula particles", "smoke aerosol particle"),
    ("deteccao detectar detector alarme sensor", "detection detector alarm sensor"),
    ("pirolise aquecimento superaquecimento", "pyrolysis overheating"),
    ("baixo baixa fluxo ventilacao low flow", "low flow ventilation"),
    ("supressao extinguir extintor apagar", "suppression extinguishment nozzle"),
    ("inflamabilidade ignicao propagacao queima", "flammability ignition spread burning"),
    ("limpeza contaminacao toxico pos incendio", "cleanup filtration toxic combustion products"),
    ("terrestre terra bombeiro protecao", "terrestrial earth firefighter protective"),
    ("lua lunar moon gravidade", "lunar gravity moon"),
]
MATERIALS = {
    "pmma": ["pmma", "polymethyl methacrylate", "acrilico", "acrylic"],
    "nomex": ["nomex"], "kapton": ["kapton", "polyimide", "poliimida"],
    "sibal": ["sibal"], "teflon": ["teflon", "ptfe"],
    "aluminio": ["aluminio", "aluminum", "aluminium"],
}
STOP = {"a", "o", "e", "de", "do", "da", "em", "no", "na", "os", "as", "para", "com", "um", "uma", "como", "que", "the", "of", "and", "in", "to", "is", "for", "with", "on", "this", "can", "it", "from"}


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFKD", str(text).lower()) if not unicodedata.combining(c))


def tokens(text):
    return [word for word in re.findall(r"psi-\d+|[a-z0-9]+", fold(text)) if word not in STOP and len(word) > 1]


def canonical_material(text):
    value = fold(text)
    for material, aliases in MATERIALS.items():
        if any(re.search(r"\b" + re.escape(alias) + r"\b", value) for alias in aliases):
            return material
    return value.strip()


def expanded_query(question, intent, material):
    value = fold(question)
    extra = [replacement for trigger, replacement in ALIASES if set(tokens(trigger)) & set(tokens(value))]
    return " ".join([question, INTENT_WORDS[intent], material, *extra])


def validate_request(value):
    if not isinstance(value, dict):
        raise ValueError("Envie um objeto JSON.")
    question = value.get("question")
    intent = value.get("intent")
    context = value.get("context")
    if not isinstance(question, str) or not question.strip() or len(question) > 2500:
        raise ValueError("A pergunta deve ter de 1 a 2500 caracteres.")
    if intent not in INTENTS:
        raise ValueError("Intenção de pesquisa inválida.")
    if not isinstance(context, dict):
        raise ValueError("Contexto do cenário ausente.")
    clean = {}
    for name in ["vehicle", "surfaceId", "surfaceName", "structureKind", "material"]:
        field = context.get(name)
        if not isinstance(field, str) or not field.strip() or len(field) > 180:
            raise ValueError(f"Campo de contexto inválido: {name}.")
        clean[name] = field.strip()
    if clean["vehicle"] not in {"orion", "iss"}:
        raise ValueError("Ambiente desconhecido.")
    if clean["surfaceId"] not in {"console_main", "crew_seats", "wall_panels", "cable_run", "floor"}:
        raise ValueError("Estrutura desconhecida.")
    for name, low, high in [("oxygenPct", 0, 100), ("pressureKpa", 0.001, 1000), ("flowCmS", 0, 1000), ("gravityG", 0, 1)]:
        field = context.get(name)
        if isinstance(field, bool) or not isinstance(field, (int, float)) or not math.isfinite(field) or not low <= field <= high:
            raise ValueError(f"Condição ou unidade inválida: {name}.")
        clean[name] = field
    limit = value.get("limit", 6)
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 10:
        raise ValueError("Limite deve estar entre 1 e 10 investigações.")
    return {"question": question.strip(), "intent": intent, "context": clean, "limit": limit}


class LexicalIndex:
    def __init__(self, entries):
        self.entries = entries
        self.terms = [Counter(tokens(entry["text"])) for entry in entries]
        self.lengths = [sum(term.values()) for term in self.terms]
        self.average = sum(self.lengths) / max(len(self.lengths), 1) or 1
        self.frequency = Counter(word for term in self.terms for word in term)

    def scores(self, query):
        words = set(tokens(query))
        total = len(self.entries)
        result = []
        for index, term in enumerate(self.terms):
            score = 0.0
            for word in words & term.keys():
                idf = math.log(1 + (total - self.frequency[word] + 0.5) / (self.frequency[word] + 0.5))
                tf = term[word]
                score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * self.lengths[index] / self.average))
            result.append(score)
        return result


class ResearchService:
    def __init__(self, root: Path, provider=None, store=None):
        self.root = Path(root)
        source_bytes = (self.root / "public/data/nasa-experiments.json").read_bytes()
        snapshot = json.loads(source_bytes)
        if snapshot.get("schemaVersion") != 1 or not isinstance(snapshot.get("investigations"), list):
            raise ValueError("Snapshot PSI inválido.")
        self.investigations = snapshot["investigations"]
        corpus_path = self.root / "public/data/research-corpus.json"
        corpus_bytes = corpus_path.read_bytes() if corpus_path.exists() else b'{}'
        corpus = json.loads(corpus_bytes)
        self.documents = corpus.get("documents", [])
        self.corpus_version = hashlib.sha256(source_bytes + corpus_bytes).hexdigest()[:20]
        self.provider = provider if provider is not None else AIProvider()
        # An injected provider (tests) never touches the shared database implicitly.
        self.store = store if store is not None else (MongoVectorStore.from_env() if provider is None and self.provider.embeddings_configured else None)
        self.entries, self.metadata_sources = [], {}
        self.records = {row["id"]: row.get("tests", []) for row in self.investigations}
        for investigation in self.investigations:
            material_names = list(dict.fromkeys(record["material"] for record in investigation.get("tests", []) if record.get("material")))
            text = f"{investigation['name']}. {investigation.get('title', '')}. {investigation.get('description', '')} Materiais tabulares: {'; '.join(material_names[:45])}"
            source = {"id": f"{investigation['id']}:metadata", "title": investigation["title"], "url": investigation["sourceUrl"], "location": "Metadados PSI; objetivo e inventário tabular, não desfecho medido", "text": text, "investigationIds": [investigation["id"]], "topics": [], "kind": "metadata"}
            self.metadata_sources[investigation["id"]] = source
            self.entries.append(source)
        for document in self.documents:
            for passage in document.get("passages", []):
                if not isinstance(passage.get("text"), str) or not passage["text"].strip():
                    continue
                self.entries.append({"id": passage["id"], "title": document["title"], "url": document["url"], "location": passage.get("location", "Documento original"), "text": passage["text"], "investigationIds": document.get("investigationIds", []), "topics": document.get("topics", []), "kind": "document"})
        self.index = LexicalIndex(self.entries)
        self._vectors = None
        self._vector_lock = threading.Lock()
        self._hybrid_ready = False

    def status(self):
        return {"status": "ready", "corpusVersion": self.corpus_version, "investigationCount": len(self.investigations), "recordCount": sum(len(rows) for rows in self.records.values()), "documentCount": len(self.documents), "passageCount": sum(row["kind"] == "document" for row in self.entries), "generationConfigured": bool(self.provider.generation_configured), "embeddingsConfigured": bool(self.provider.embeddings_configured), "generationModel": getattr(self.provider, "generation_model", None) if self.provider.generation_configured else None, "embeddingModel": getattr(self.provider, "embedding_model", None) if self.provider.embeddings_configured else None, "vectorStore": ("mongodb-atlas" if self.store.search_ready else "mongodb-atlas (índice em preparo)") if self.store else ("memory" if self.provider.embeddings_configured else None), "retrievalMode": "hybrid" if self._hybrid_ready else "lexical-structured"}

    def _ensure_vectors(self):
        """Load corpus vectors from MongoDB when present; otherwise embed once and persist."""
        if self._vectors is not None:
            return
        model = getattr(self.provider, "embedding_model", "unknown")
        known = {}
        if self.store:
            try:
                known = self.store.load(model, self.entries)
            except Exception:
                known = {}
        missing = [entry for entry in self.entries if entry["id"] not in known]
        # Embed only what is missing, persisting each chunk so an interrupted run keeps its progress.
        for offset in range(0, len(missing), 24):
            chunk = missing[offset:offset + 24]
            vectors = self.provider.embed([entry["text"] for entry in chunk], "RETRIEVAL_DOCUMENT")
            if len(vectors) != len(chunk):
                raise ProviderError("Quantidade de embeddings divergente.")
            known.update({entry["id"]: vector for entry, vector in zip(chunk, vectors)})
            if self.store:
                try:
                    self.store.save(model, chunk, vectors)
                except Exception:
                    pass  # Persistence is an optimisation; in-memory ranking stays valid.
        vectors = [known[entry["id"]] for entry in self.entries]
        if not vectors or any(len(row) != len(vectors[0]) for row in vectors):
            raise ProviderError("Dimensões de índice inválidas.")
        if self.store:
            try:
                self.store.prune(model, self.entries)
                self.store.ensure_index(len(vectors[0]))
            except Exception:
                pass
        self._vectors = vectors

    def warm_up(self):
        if not self.provider.embeddings_configured:
            return
        with self._vector_lock:
            self._ensure_vectors()
            if self.store and not self.store.search_ready:
                self.store.ensure_index(len(self._vectors[0]), wait_seconds=120)

    def _dense_ranks(self, query):
        with self._vector_lock:
            self._ensure_vectors()
            query_vectors = self.provider.embed([query], "RETRIEVAL_QUERY")
            if len(query_vectors) != 1:
                raise ProviderError("Dimensões de índice inválidas.")
            vector = query_vectors[0]
            if not vector or len(vector) != len(self._vectors[0]):
                self._vectors = None
                raise ProviderError("Modelo/indexação incompatíveis.")
            if any(not math.isfinite(v) for v in vector):
                raise ProviderError("Vetor não finito.")
            positions = {}
            for index, entry in enumerate(self.entries):
                positions.setdefault(text_hash(entry["text"]), index)
            if self.store and self.store.search_ready:
                try:
                    hits = self.store.search(vector, getattr(self.provider, "embedding_model", "unknown"), len(self.entries))
                    order = [positions[identity] for identity, _ in hits if identity in positions]
                    if order:
                        self._hybrid_ready = True
                        return order
                except Exception:
                    pass  # Fall back to exact in-memory ranking over the same stored vectors.
            scores = [sum(a * b for a, b in zip(row, vector)) for row in self._vectors]
            self._hybrid_ready = True
            return sorted(range(len(scores)), key=lambda index: (-scores[index], self.entries[index]["id"]))

    def _record_rank(self, record, material, context):
        score = 12 if material and canonical_material(record.get("material") or "") == material else 0
        for field in ["oxygenPct", "pressureKpa", "flowCmS"]:
            value = record.get(field)
            if isinstance(value, (int, float)) and math.isfinite(value):
                score += 1 / (1 + abs(value - context[field]))
        return score

    def search(self, payload, synthesize=False):
        request = validate_request(payload)
        context, question, intent = request["context"], request["question"], request["intent"]
        material = canonical_material(context["material"])
        named_materials = [name for name, aliases in MATERIALS.items() if any(re.search(r"\b" + re.escape(alias) + r"\b", fold(question)) for alias in aliases)]
        warnings, gaps = [], []
        if named_materials:
            material = named_materials[0]
            if material != canonical_material(context["material"]):
                warnings.append("A pergunta menciona outro material; a atribuição da cena foi preservada.")
        query = expanded_query(question, intent, material)
        lexical = self.index.scores(query)
        lexical_order = sorted(range(len(lexical)), key=lambda index: (-lexical[index], self.entries[index]["id"]))
        fused = {index: 1 / (61 + rank) for rank, index in enumerate(lexical_order) if lexical[index] > 0}
        mode = "lexical-structured"
        if self.provider.embeddings_configured:
            try:
                dense = self._dense_ranks(query)
                for rank, index in enumerate(dense):
                    fused[index] = fused.get(index, 0) + 1 / (61 + rank)
                mode = "hybrid"
            except Exception:
                warnings.append("Embeddings indisponíveis; esta resposta usa busca lexical e condições estruturadas, sem vetores simulados.")
        requested_ids = set(re.findall(r"\bPSI-\d+\b", question.upper()))
        known = {row["id"] for row in self.investigations}
        if requested_ids - known:
            gaps.append("Identificador solicitado não está no snapshot local: " + ", ".join(sorted(requested_ids - known)) + ". Isso não prova ausência no PSI completo.")
        lunar = bool(re.search(r"\b(lua|lunar|moon|marte|mars)\b|1\s*/\s*6", fold(question))) or context["gravityG"] not in (0, 1)
        if lunar:
            gaps.append("Transferência para gravidade parcial/lunar não validada neste snapshot; 0 g não é um limite superior conservador garantido.")
        if not self.documents:
            gaps.append("Corpus científico indisponível; apenas metadados e tabelas estão disponíveis.")
        has_material = any(canonical_material(row.get("material") or "") == material for records in self.records.values() for row in records)
        if not has_material:
            gaps.append(f"Nenhum registro tabular com correspondência explícita ao material {context['material']} foi encontrado; referências relacionadas não substituem medições desse material.")
        entry_rank = sorted(fused, key=lambda index: (-fused[index], self.entries[index]["id"]))
        document_hits = []
        per_document = Counter()
        for index in entry_rank:
            source = self.entries[index]
            if source["kind"] != "document" or (source["topics"] and intent not in source["topics"]):
                continue
            if requested_ids and not (requested_ids & set(source["investigationIds"])):
                continue
            if per_document[source["title"]] >= 2:
                continue
            per_document[source["title"]] += 1
            document_hits.append(source)
            if len(document_hits) >= 6:
                break
        results = []
        for investigation in self.investigations:
            identity = investigation["id"]
            if requested_ids and identity not in requested_ids:
                continue
            metadata_index = next(index for index, entry in enumerate(self.entries) if entry["id"] == f"{identity}:metadata")
            category = investigation["category"]
            record_list = sorted(self.records[identity], key=lambda row: (-self._record_rank(row, material, context), row["id"]))
            matched = [record for record in record_list if canonical_material(record.get("material") or "") == material]
            score = lexical[metadata_index] + CATEGORY_INTENT[intent].get(category, 0) + (10 if matched else 0)
            if mode == "hybrid":
                score += fused.get(metadata_index, 0) * 100
            if requested_ids:
                score += 100
            associated = [source for source in document_hits if identity in source["investigationIds"]]
            score += min(3, len(associated))
            if score <= 0:
                continue
            reasons, mismatches = [], []
            if matched:
                reasons.append("Correspondência nominal de material nos registros originais; composição e geometria ainda precisam ser verificadas.")
            if CATEGORY_INTENT[intent].get(category, 0):
                reasons.append("Família de investigação pertinente à intenção selecionada.")
            if associated:
                reasons.append("Documentação científica relacionada recuperada com localização na fonte.")
            if requested_ids:
                reasons.append("Identificador explicitamente solicitado, sem ampliação silenciosa da busca.")
            if category in {"droplet", "gas"} and canonical_material(context["material"]) in MATERIALS:
                mismatches.append("Combustível/arranjo não equivale à superfície sólida selecionada; não transferir parâmetros para a cabine.")
            if not matched:
                mismatches.append("Sem correspondência nominal de material neste conjunto de registros; tratar como contexto/análogo.")
            selected_records = (matched or record_list)[:6]
            unknowns = ["Geometria, espessura e escala da estrutura não foram equiparadas à amostra; nenhuma compatibilidade física completa é afirmada."]
            for field, title in [("oxygenPct", "Oxigênio"), ("pressureKpa", "Pressão"), ("flowCmS", "Velocidade calibrada do fluxo")]:
                if not selected_records or any(record.get(field) is None for record in selected_records):
                    unknowns.append(f"{title}: há valores ausentes nos registros exibidos; não foram preenchidos com o cenário.")
            if selected_records:
                nearest = selected_records[0]
                for field, title, unit in [("oxygenPct", "O₂", "%"), ("pressureKpa", "Pressão", "kPa"), ("flowCmS", "Fluxo", "cm/s")]:
                    value = nearest.get(field)
                    if value is not None and not math.isclose(value, context[field], rel_tol=1e-6, abs_tol=1e-6):
                        mismatches.append(f"{title} do primeiro registro: {value:g} {unit}; cenário: {context[field]:g} {unit}. Comparação, não equivalência.")
            visible = {key: deepcopy(value) for key, value in investigation.items() if key != "tests"}
            results.append({"investigation": visible, "score": round(score, 4), "relevance": "related" if matched and not category in {"gas", "droplet"} else "analog" if selected_records else "context", "reasons": reasons or ["Relação lexical com a pergunta e o contexto informado."], "mismatches": mismatches, "unknowns": unknowns, "records": deepcopy(selected_records), "sources": deepcopy(associated + [self.metadata_sources[identity]])})
        results.sort(key=lambda row: (-row["score"], row["investigation"]["id"]))
        results = results[:request["limit"]]
        if not results:
            gaps.append("Nenhuma investigação corresponde às restrições no snapshot local. Revise o identificador ou amplie a pergunta explicitamente.")
        sources = {row["id"]: deepcopy(row) for row in document_hits}
        for result in results:
            for source in result["sources"]:
                sources[source["id"]] = source
        findings = [{"text": row["text"], "sourceIds": [row["id"]]} for row in document_hits[:4]]
        if not findings:
            findings = [{"text": self.metadata_sources[result["investigation"]["id"]]["text"], "sourceIds": [self.metadata_sources[result["investigation"]["id"]]["id"]]} for result in results[:3]]
        context_key = hashlib.sha256(json.dumps(request | {"corpusVersion": self.corpus_version}, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
        bundle = {"schemaVersion": 1, "requestId": str(uuid.uuid4()), "contextKey": context_key, "corpusVersion": self.corpus_version, "question": question, "intent": intent, "context": context, "retrievalMode": mode, "synthesisMode": "extractive", "summary": f"{len(results)} investigações relacionadas recuperadas. Compare as condições e consulte os trechos originais; o ranking indica relevância, não risco ou validação da cabine.", "findings": findings, "investigations": results, "sources": list(sources.values()), "gaps": gaps, "warnings": warnings, "visualization": {"mode": "illustrative", "label": "Cenário ilustrativo — hipóteses visuais, não previsão validada", "replayAvailable": False, "predictionAvailable": False, "reasons": ["O snapshot tabular não fornece uma trajetória temporal de cabine.", "Nenhum preditor físico foi calibrado/validado; métricas de alarme, temperatura e contenção estão indisponíveis."]}}
        if synthesize:
            if not self.provider.generation_configured:
                bundle["warnings"].append("IA generativa não configurada; os trechos e a síntese continuam extrativos.")
            else:
                # Numbers the user supplied (question/scenario) and source identifiers may be restated.
                allowed = " ".join([question, json.dumps(context, ensure_ascii=False), *gaps, *sources.keys(), *(row["title"] for row in sources.values())])
                feedback = None
                for _ in range(2):
                    try:
                        request_bundle = deepcopy(bundle)
                        if feedback:
                            request_bundle["feedback"] = feedback
                        generated = self.provider.generate(request_bundle)
                        self._validate_generation(generated, sources, allowed)
                        bundle.update(summary=generated["summary"], findings=generated["findings"], synthesisMode="claude")
                        bundle["warnings"].append("Síntese gerada por modelo, com referências verificadas por ID; revisar o suporte científico no texto-fonte.")
                        break
                    except ProviderError as exc:
                        feedback = f"A tentativa anterior foi rejeitada pela validação: {exc} Corrija e responda novamente."
                    except Exception:
                        break
                if bundle["synthesisMode"] != "claude":
                    bundle["warnings"].append("Síntese generativa indisponível ou rejeitada por validação; preservamos o resultado extrativo real.")
        return bundle

    @staticmethod
    def _validate_generation(value, sources, allowed=""):
        if not isinstance(value, dict) or not isinstance(value.get("summary"), str) or not 1 <= len(value["summary"]) <= 2400:
            raise ProviderError("Resumo inválido.")
        findings = value.get("findings")
        if not isinstance(findings, list) or not 1 <= len(findings) <= 4:
            raise ProviderError("Achados inválidos.")
        for finding in findings:
            if not isinstance(finding, dict) or not isinstance(finding.get("text"), str) or not 1 <= len(finding["text"]) <= 5000:
                raise ProviderError("Achado inválido.")
            ids = finding.get("sourceIds")
            if not isinstance(ids, list) or not ids or any(not isinstance(identity, str) or identity not in sources for identity in ids):
                raise ProviderError("Citação não recuperada.")
        text = fold(value["summary"] + " " + " ".join(row["text"] for row in findings))
        if re.search(r"garant(?:e|ia|ido).*segur|risco zero|desligue|desative|aplique o extintor", text):
            raise ProviderError("Alegação operacional não permitida.")
        for match in re.finditer(r"certific", text):
            # "não é certificado" is a legitimate limitation; an affirmative certification claim is not.
            if not re.search(r"\b(nao|nem|sem|nenhum|nenhuma)\b", text[max(0, match.start() - 25):match.start()]):
                raise ProviderError("Alegação de certificação não permitida.")
        # Reject new numerical quantities; keep cited experimental text intact.
        reference = " ".join(row["text"] for row in sources.values()) + " " + allowed
        reference_numbers = {number.replace(",", ".") for number in re.findall(r"\d+(?:[.,]\d+)?", reference)}
        for number in re.findall(r"\d+(?:[.,]\d+)?", value["summary"] + " ".join(row["text"] for row in findings)):
            if number.replace(",", ".") not in reference_numbers and number not in reference:
                raise ProviderError(f"Quantidade '{number}' não encontrada nas evidências.")
