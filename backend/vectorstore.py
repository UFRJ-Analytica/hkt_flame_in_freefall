"""Persistent vector index in MongoDB Atlas (Atlas Vector Search).

Vectors are keyed by (embedding model, SHA-256 of the embedded text): restarts
and data refreshes that keep a passage's text reuse its stored vector instead
of paying to embed it again.
"""
from __future__ import annotations

import hashlib
import os
import time

INDEX_NAME = "passage_vectors"


def text_hash(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class MongoVectorStore:
    def __init__(self, uri, user, password, database, collection="passages"):
        from pymongo import MongoClient

        self._client = MongoClient(uri, username=user or None, password=password or None, serverSelectionTimeoutMS=10000, appname="habitatfire")
        self.collection = self._client[database][collection]
        self.search_ready = False

    @classmethod
    def from_env(cls):
        uri = os.environ.get("MONGODB_URI", "")
        if os.environ.get("HABITATFIRE_ENABLE_AI") != "1" or not uri:
            return None
        try:
            return cls(uri, os.environ.get("MONGODB_USER", ""), os.environ.get("MONGODB_PASSWORD", ""), os.environ.get("MONGODB_DB", "habitatfire"))
        except Exception:
            return None

    def load(self, model, entries):
        """Return {entry id: vector} for entries whose exact text is already embedded."""
        hashes = {text_hash(entry["text"]): entry["id"] for entry in entries}
        found = {}
        for row in self.collection.find({"model": model, "textHash": {"$in": list(hashes)}}, {"textHash": 1, "embedding": 1}):
            found[hashes[row["textHash"]]] = row["embedding"]
        return found

    def save(self, model, entries, vectors):
        from pymongo import ReplaceOne

        operations = []
        for entry, vector in zip(entries, vectors):
            digest = text_hash(entry["text"])
            operations.append(ReplaceOne(
                {"_id": f"{model}:{digest}"},
                {"_id": f"{model}:{digest}", "textHash": digest, "entryId": entry["id"], "model": model, "kind": entry["kind"], "title": entry["title"], "text": entry["text"], "embedding": vector},
                upsert=True,
            ))
        if operations:
            self.collection.bulk_write(operations, ordered=False)

    def prune(self, model, entries):
        keep = [text_hash(entry["text"]) for entry in entries]
        self.collection.delete_many({"model": model, "textHash": {"$nin": keep}})

    def ensure_index(self, dimensions, wait_seconds=0):
        from pymongo.operations import SearchIndexModel

        existing = {row["name"] for row in self.collection.list_search_indexes()}
        if INDEX_NAME not in existing:
            self.collection.create_search_index(SearchIndexModel(
                name=INDEX_NAME,
                type="vectorSearch",
                definition={"fields": [
                    {"type": "vector", "path": "embedding", "numDimensions": dimensions, "similarity": "dotProduct"},
                    {"type": "filter", "path": "model"},
                ]},
            ))
        deadline = time.monotonic() + wait_seconds
        while True:
            index = next(iter(self.collection.list_search_indexes(INDEX_NAME)), None)
            self.search_ready = bool(index and index.get("queryable"))
            if self.search_ready or time.monotonic() >= deadline:
                return self.search_ready
            time.sleep(3)

    def search(self, vector, model, limit):
        """Return text hashes ordered by vector similarity."""
        pipeline = [
            {"$vectorSearch": {"index": INDEX_NAME, "path": "embedding", "queryVector": vector, "numCandidates": max(limit * 4, 100), "limit": limit, "filter": {"model": model}}},
            {"$project": {"_id": 0, "textHash": 1, "score": {"$meta": "vectorSearchScore"}}},
        ]
        return [(row["textHash"], row["score"]) for row in self.collection.aggregate(pipeline)]
