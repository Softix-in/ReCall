#!/usr/bin/env python3
"""Extractive TF-IDF summariser — stdin text, stdout JSON {title, summary}."""

import json
import math
import re
import sys
from collections import Counter

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "while", "with", "of", "at",
    "by", "for", "to", "in", "on", "is", "are", "was", "were", "be", "been",
    "being", "it", "its", "this", "that", "these", "those", "as", "from",
    "into", "about", "over", "after", "before", "between", "through", "during",
    "not", "no", "nor", "so", "than", "too", "very", "can", "will", "just",
    "we", "you", "they", "he", "she", "i", "my", "our", "your", "their",
}


def tokenize_words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text.lower())


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def tfidf_summarise(text: str, title_count: int = 1, summary_count: int = 5) -> dict:
    sentences = split_sentences(text)

    if not sentences:
        return {"title": "", "summary": ""}

    if len(sentences) == 1:
        return {"title": sentences[0], "summary": sentences[0]}

    tokenized = [tokenize_words(sentence) for sentence in sentences]
    doc_freq = Counter()

    for words in tokenized:
        for word in set(words):
            if word not in STOPWORDS:
                doc_freq[word] += 1

    num_sentences = len(sentences)
    scores = []

    for index, words in enumerate(tokenized):
        term_freq = Counter(word for word in words if word not in STOPWORDS)
        score = 0.0

        for word, count in term_freq.items():
            idf = math.log((num_sentences + 1) / (doc_freq[word] + 1)) + 1
            score += (count / max(len(words), 1)) * idf

        if index == 0:
            score *= 1.2
        if index == num_sentences - 1:
            score *= 1.1

        scores.append((index, score))

    ranked = sorted(scores, key=lambda item: item[1], reverse=True)
    top_indices = sorted(idx for idx, _ in ranked[: max(title_count + summary_count, 2)])

    title_index = ranked[0][0]
    title = sentences[title_index]

    summary_indices = []
    for idx, _ in ranked:
        if idx not in summary_indices:
            summary_indices.append(idx)
        if len(summary_indices) >= summary_count:
            break

    summary_indices = sorted(summary_indices)
    summary = " ".join(sentences[i] for i in summary_indices)

    return {"title": title, "summary": summary}


def first_sentence(text: str) -> str:
    sentences = split_sentences(text)
    return sentences[0] if sentences else text.strip()


def main() -> None:
    raw = sys.stdin.read().strip()

    if not raw:
        print(json.dumps({"title": "", "summary": ""}))
        return

    result = tfidf_summarise(raw)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
