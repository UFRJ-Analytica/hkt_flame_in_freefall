"""Build public/data/modeling-targets.json: curated, provenance-carrying modeling targets.

The SAFFIRE tables mix units, swapped headers, blank continuation cells and footnotes.
Every interpreted value here is paired with the exact raw CSV cell it came from; the
script fails if a raw cell no longer matches, so a re-synced table can never be silently
reinterpreted. Values that cannot be read unambiguously stay null with a note.

Run: python scripts/build_modeling_targets.py
"""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "psi"
OUT = ROOT / "public" / "data" / "modeling-targets.json"
SAFFIRE_MODEL = ROOT / "public" / "data" / "saffire" / "psi-98-s1-neighbors.json"
SAFFIRE_III_MODEL = ROOT / "public" / "data" / "saffire" / "psi-100-s1.json"
PORTAL = "https://psi.nasa.gov/physci/repo/data/investigations/"
NTRS_SAFFIRE_I = "https://ntrs.nasa.gov/api/citations/20170008805/downloads/20170008805.pdf"

TABLES = {
    "PSI-98": "PSI-98_Experimental table_SAFFIRE-1.csv",
    "PSI-99": "PSI-99_Experimental table_SAFFIRE-2.csv",
    "PSI-100": "PSI-100_Experimental table_SAFFIRE-3.csv",
}

OUTCOMES = {
    "sustained": "Propagação sustentada",
    "no-sustained": "Sem propagação sustentada",
    "anchored": "Chama ancorada na base",
    "not-ignited": "Não ignitou",
}


def read_table(accession: str) -> tuple[list[str], list[list[str]], str]:
    path = RAW / accession / TABLES[accession]
    data = path.read_bytes()
    rows = list(csv.reader(data.decode("utf-8-sig").splitlines()))
    return [h.strip() for h in rows[0]], rows[1:], hashlib.sha256(data).hexdigest()


def cell(header: list[str], row: list[str], name: str) -> str:
    return row[header.index(name)] if header.index(name) < len(row) else ""


def check(raw: dict[str, str], expected: dict[str, str], where: str) -> None:
    for key, value in expected.items():
        if raw.get(key) != value:
            raise SystemExit(f"{where}: raw cell {key!r} is {raw.get(key)!r}, expected {value!r}; re-curate before publishing")


def base(accession: str, campaign: str, sample: str, row_number: int, raw: dict[str, str], digest: str) -> dict:
    return {
        "id": f"{accession}:{sample}",
        "investigation": accession,
        "campaign": campaign,
        "sample": sample,
        "gravity": "microgravity",
        "platform": "Cygnus (órbita, após saída da ISS)",
        "pressureKpa": None,
        "source": {
            "file": TABLES[accession],
            "row": row_number,
            "sha256": digest,
            "url": PORTAL + accession,
        },
        "raw": raw,
        "notes": [],
    }


def saffire_i() -> list[dict]:
    header, rows, digest = read_table("PSI-98")
    out = []
    for i, row in enumerate(rows, start=2):
        raw = {h: cell(header, row, h).strip() for h in header if cell(header, row, h).strip()}
        sample = raw.get("Sample Number")
        if sample not in {"S1", "S2"}:
            continue
        check(raw, {
            "Material": "SIBAL Fabric", "Sample Thickness (cm)": "0.37", "Sample Length (cm)": "40.6",
            "Sample Width (cm)": "94", "Air Flow (cm/s)": "20", "Ignition Power (W)": "182", "Ignition Time (s)": "8",
        }, f"PSI-98 {sample}")
        record = base("PSI-98", "SAFFIRE-I", sample, i, raw, digest)
        record.update({
            "material": "SIBAL",
            "materialDetail": "Tecido algodão/fibra de vidro (SIBAL)",
            "thicknessMm": 0.37,
            "lengthMm": 940,
            "widthMm": 406,
            "flowCmS": 20,
            "flowDirection": "concurrent" if sample == "S1" else "opposed",
            "oxygenPct": [21.5, 21.7] if sample == "S1" else [21.5, 21.5],
            "ignition": {"powerW": 182, "durationS": 8},
            "burnTimeS": 420 if sample == "S1" else 70,
            "outcome": "sustained" if sample == "S1" else None,
            "spreadRateMmS": None,
            "burnLengthMm": None,
            "onegComparison": None,
            "cameras": [raw.get("Camera 1"), raw.get("Camera 2")],
            "framesStatus": "processed" if sample == "S1" else "available",
        })
        record["notes"].append("Cabeçalho da tabela indica cm para espessura e troca comprimento/largura; adotado 0,37 mm, 940 × 406 mm conforme NTRS 20170008805, Tabela 1.")
        record["notes"].append("Potência de ignição: 182 W na tabela PSI e na p. 31 do NTRS; a p. 23 do mesmo documento cita 165 W. Divergência mantida, sem média.")
        if sample == "S1":
            check(raw, {"Percent O2": "21.5 - 21.7", "Burn Time (s)": "420", "Flow Direction": "Concurrent"}, "PSI-98 S1")
            record["spreadRateMmS"] = 1.8
            record["spreadRateSource"] = {"kind": "publication", "label": "NTRS 20170008805: média de 1,8 mm/s", "url": NTRS_SAFFIRE_I}
        else:
            check(raw, {"Percent O2": "~ 21.5", "Burn Time (s)": "70", "Flow Direction": "Opposed"}, "PSI-98 S2")
            record["oxygenApproximate"] = True
            record["notes"].append("Desfecho não tabulado; a tabela registra 70 s de queima. Frames públicos ainda não processados.")
        out.append(record)
    return out


SAFFIRE_II = {
    # sample: (material, materialDetail, thicknessMm, direction, outcome, spread, burnLengthMm, extra notes)
    "2-1": ("Silicone", "Silicone", 0.27, "concurrent", "no-sustained", None, 0, []),
    "2-2": ("Silicone", "Silicone", 0.61, "concurrent", "no-sustained", None, 0, []),
    "2-3": ("Silicone", "Silicone", 1.03, "concurrent", "no-sustained", None, 0, []),
    "2-4": ("Silicone", "Silicone", None, "opposed", "no-sustained", None, 0,
            ["Espessura registrada como \"037 mm\"; grafia ambígua, mantida sem interpretação."]),
    "2-5": ("SIBAL", "Tecido algodão/fibra de vidro (SIBAL)", 0.37, "concurrent", "sustained", 2.1, 290,
            ["Espessura registrada como \"037 mm\"; interpretada como 0,37 mm, o mesmo tecido do SAFFIRE-I."]),
    "2-6": ("SIBAL", "Tecido algodão/fibra de vidro (SIBAL)", 0.37, "concurrent", "sustained", 2.6, 290,
            ["Célula de material vazia; interpretada como continuação da linha anterior (SIBAL).",
             "Espessura registrada como \"037 mm\"; interpretada como 0,37 mm."]),
    "2-7": ("PMMA + Nomex", "PMMA 0,85 mm (5 cm) seguido de Nomex 0,37 mm (24 cm)", None, "concurrent", "not-ignited", None, 50,
            ["Nota 2 da tabela: a porção de PMMA foi totalmente consumida, mas o Nomex não ignitou."]),
    "2-8": ("PMMA", "PMMA", None, "concurrent", "anchored", None, 100,
            ["Espessura: \"See Fig. 5\" (perfil variável, não tabulado).",
             "Nota 4: chamas ancoradas na base, regressão muito lenta (0,01 a 0,04 mm/s)."]),
    "2-9": ("PMMA", "PMMA", 10.0, "concurrent", "anchored", None, 100,
            ["Célula de material vazia; interpretada como continuação da linha anterior (PMMA).",
             "Nota 4: chamas ancoradas na base, regressão muito lenta (0,01 a 0,04 mm/s)."]),
}

SAFFIRE_II_RAW = {
    "2-1": {"Material": "Silicone", "Samle Thickness": "0.27 mm", "Percent O2 (Note 1)": "~ 21.5", "?-g Burn Length": "~ 0"},
    "2-2": {"Samle Thickness": "0.61 mm", "Percent O2 (Note 1)": "~ 22.1", "?-g Burn Length": "~ 0"},
    "2-3": {"Samle Thickness": "1.03 mm", "Percent O2 (Note 1)": "~ 22.1", "?-g Burn Length": "~ 0"},
    "2-4": {"Material": "Silicone", "Samle Thickness": "037 mm", "?-g Burn Length": "~ 0", "Flow Direction": "Opposed"},
    "2-5": {"Material": "Cotton-Fiberglass (SIBAL)", "Samle Thickness": "037 mm", "?-g Burn Length": "29 cm", "Burn Time (s)": "145 s"},
    "2-6": {"Samle Thickness": "037 mm", "?-g Burn Length": "29 cm", "Burn Time (s)": "115 s"},
    "2-7": {"Material": "PMMA & Nomex", "?-g Burn Length": "5 cm & 0 (note 2)", "Burn Time (s)": "140 s"},
    "2-8": {"Material": "PMMA", "Samle Thickness": "See Fig. 5", "Percent O2 (Note 1)": "22.1 to 22.0", "?-g Burn Length": "~ 10 cm (note 3)", "Ignition Power (W)": "97 W", "Ignition Time (s)": "30 s", "Burn Time (s)": "600 s"},
    "2-9": {"Samle Thickness": "1 cm", "Percent O2 (Note 1)": "22.0 to 21.9", "?-g Burn Length": "~ 10 cm (note 4)", "Ignition Power (W)": "97 W", "Ignition Time (s)": "30 s", "Burn Time (s)": "900 s"},
}

SAFFIRE_II_OXYGEN = {"2-1": [21.5, 21.5], "2-8": [22.0, 22.1], "2-9": [21.9, 22.0]}
SAFFIRE_II_IGNITION = {"2-8": (97, 30), "2-9": (97, 30)}
SAFFIRE_II_BURN = {"2-5": 145, "2-6": 115, "2-7": 140, "2-8": 600, "2-9": 900}


def saffire_ii() -> list[dict]:
    header, rows, digest = read_table("PSI-99")
    out = []
    for i, row in enumerate(rows, start=2):
        raw = {h: cell(header, row, h).strip() for h in header if cell(header, row, h).strip()}
        sample = raw.get("Sample Number")
        if sample not in SAFFIRE_II:
            continue
        material, detail, thickness, direction, outcome, spread, burn_mm, notes = SAFFIRE_II[sample]
        check(raw, {"Air Flow (cm/s)": "20 cm/s", "Sample Width (cm)": "5 cm", **SAFFIRE_II_RAW[sample]}, f"PSI-99 {sample}")
        if spread is not None:
            check(raw, {"?-g Spread Length": f"{spread} mm/s"}, f"PSI-99 {sample}")
        record = base("PSI-99", "SAFFIRE-II", sample, i, raw, digest)
        power, duration = SAFFIRE_II_IGNITION.get(sample, (80, 9.2))
        record.update({
            "material": material,
            "materialDetail": detail,
            "thicknessMm": thickness,
            "lengthMm": 290,
            "widthMm": 50,
            "flowCmS": 20,
            "flowDirection": direction,
            "oxygenPct": SAFFIRE_II_OXYGEN.get(sample, [22.1, 22.1]),
            "oxygenApproximate": sample not in {"2-8", "2-9"},
            "ignition": {"powerW": power, "durationS": duration},
            "burnTimeS": SAFFIRE_II_BURN.get(sample),
            "outcome": outcome,
            "spreadRateMmS": spread,
            "spreadRateSource": {"kind": "table", "label": "Tabela PSI-99, coluna de propagação em µg"} if spread else None,
            "burnLengthMm": burn_mm,
            "onegComparison": {"burnLength": raw.get("1-g Burn Length"), "spreadRate": raw.get("1-g Spread Rate")},
            "cameras": [c for c in (raw.get("Camera 1"), raw.get("Camera 2")) if c and c != "n/a"],
            "framesStatus": "not-in-psi",
        })
        record["notes"] = notes + [
            "O₂ derivado da produção de CO₂ medida e referenciado ao O₂ inicial informado pela ISS (nota 1 da tabela).",
            "As colunas \"?-g\" da tabela original são os resultados em microgravidade (símbolo µ perdido na codificação).",
        ]
        if sample in {"2-8", "2-9"}:
            record["burnLengthApproximate"] = True
            record["notes"].append("Comprimento em µg é o trecho com dano visível significativo (nota 3), aproximado.")
        if outcome == "no-sustained":
            record["notes"].append("Comprimento queimado em µg registrado como \"~ 0\".")
        out.append(record)
    return out


def saffire_iii() -> list[dict]:
    header, rows, digest = read_table("PSI-100")
    out = []
    for i, row in enumerate(rows, start=2):
        raw = {h: cell(header, row, h).strip() for h in header if cell(header, row, h).strip()}
        sample = raw.get("Sample Number")
        if sample not in {"S1", "S2"}:
            continue
        check(raw, {"Material": "SIBAL Fabric", "Sample Thickness": ".33 cm", "Air Flow": "30 cm/s"}, f"PSI-100 {sample}")
        record = base("PSI-100", "SAFFIRE-III", sample, i, raw, digest)
        record.update({
            "material": "SIBAL",
            "materialDetail": "Tecido algodão/fibra de vidro (SIBAL)",
            "thicknessMm": None,
            "lengthMm": 940,
            "widthMm": 406,
            "flowCmS": 30,
            "flowDirection": "concurrent" if sample == "S1" else "opposed",
            "oxygenPct": None,
            "ignition": None,
            "burnTimeS": None,
            "outcome": None,
            "spreadRateMmS": None,
            "burnLengthMm": None,
            "onegComparison": None,
            "cameras": [raw.get("Camera 1"), raw.get("Camera 2")],
            "framesStatus": "processed" if sample == "S1" and SAFFIRE_III_MODEL.exists() else "available",
        })
        record["notes"] = [
            "Espessura registrada como \".33 cm\"; unidade não confirmada por fonte primária nesta curadoria.",
            "O₂ e desfecho não tabulados." + (" Frames da câmera 1 processados (ver derivado)." if record["framesStatus"] == "processed" else " Frames públicos disponíveis e ainda não processados."),
        ]
        if record["framesStatus"] == "processed":
            record["outcome"] = "sustained"
            record["notes"].append("Desfecho \"propagação sustentada\" observado nos frames (frente atravessa todo o campo da câmera 1), não tabulado pela NASA.")
        out.append(record)
    return out


def derived_targets() -> list[dict]:
    model = json.loads(SAFFIRE_MODEL.read_text(encoding="utf-8"))
    validation = model["validation"]
    return [{
        "id": "PSI-98:S1:front-speed-holdout",
        "recordId": "PSI-98:S1",
        "quantity": "Velocidade da frente de contraste (trecho reservado)",
        "value": round(validation["observedSpeedMmS"], 3),
        "unit": "mm/s",
        "method": "Frente de contraste no canal verde, câmeras mapeadas S1C1/S1C2, amostragem a cada 2 s; últimos 30% da janela analisada.",
        "artifact": "public/data/saffire/psi-98-s1-neighbors.json",
        "artifactSha256": hashlib.sha256(SAFFIRE_MODEL.read_bytes()).hexdigest(),
        "limits": "Mesmo ensaio usado no ajuste; registro espacial manual aproximado.",
    }] + ([] if not SAFFIRE_III_MODEL.exists() else [saffire_iii_derived()])


def saffire_iii_derived() -> dict:
    data = json.loads(SAFFIRE_III_MODEL.read_text(encoding="utf-8"))
    return {
        "id": "PSI-100:S1:front-speed",
        "recordId": "PSI-100:S1",
        "quantity": "Velocidade da frente de contraste (câmera 1)",
        "value": round(data["observed"]["speedMmS"], 3),
        "unit": "mm/s",
        "method": "Mesmo observável e estimador do SAFFIRE I · S1 (scripts/calibrate_saffire_iii.py); OLS da mediana entre faixas.",
        "artifact": "public/data/saffire/psi-100-s1.json",
        "artifactSha256": hashlib.sha256(SAFFIRE_III_MODEL.read_bytes()).hexdigest(),
        "limits": "Só câmera 1 (~590 mm); registro manual em um quadro; O₂ e pressão não tabulados.",
    }


def main() -> int:
    records = saffire_i() + saffire_ii() + saffire_iii()
    payload = {
        "schemaVersion": 1,
        "description": "Alvos de modelagem curados das tabelas SAFFIRE I/II/III, com célula original e interpretação explícita.",
        "outcomeLabels": OUTCOMES,
        "records": records,
        "derived": derived_targets(),
        "limits": [
            "Todos os ensaios ocorreram em microgravidade na Cygnus; nenhum registro cobre gravidade lunar ou marciana.",
            "Pressão de cabine não tabulada nos ensaios SAFFIRE I–III.",
            "Desfechos são do ensaio específico (geometria, largura, ignição); não são propriedades universais do material.",
        ],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"{OUT.relative_to(ROOT)}: {len(records)} registros, {len(payload['derived'])} derivado(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
