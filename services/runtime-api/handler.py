from __future__ import annotations

import json
import os
import time
from pathlib import Path
from statistics import mean
from typing import Any
from urllib.parse import urlencode

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

analyzer = SentimentIntensityAnalyzer()
s3_client = boto3.client("s3")
CACHE_TTL_SECONDS = int(os.getenv("RUNTIME_CACHE_TTL_SECONDS", "300"))
LOCAL_FALLBACK_PATH = Path(__file__).resolve().parents[2] / "data" / "clean-articles.json"

_cached_articles: list[dict[str, Any]] = []
_cached_loaded_at = 0.0


def build_response(status_code: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        "body": json.dumps(payload),
    }


def get_query_param(event: dict[str, Any], name: str) -> str | None:
    query_params = event.get("queryStringParameters") or {}
    value = query_params.get(name)
    if value is None:
        return None
    return str(value).strip()


def label_for_compound(compound: float) -> str:
    if compound >= 0.05:
        return "positive"
    if compound <= -0.05:
        return "negative"
    return "neutral"


def load_local_fallback() -> list[dict[str, Any]]:
    if not LOCAL_FALLBACK_PATH.exists():
        return []

    with LOCAL_FALLBACK_PATH.open("r", encoding="utf-8") as file:
        payload = json.load(file)

    return payload if isinstance(payload, list) else []


def load_clean_articles() -> list[dict[str, Any]]:
    global _cached_articles, _cached_loaded_at

    now = time.time()
    if _cached_articles and now - _cached_loaded_at < CACHE_TTL_SECONDS:
        return _cached_articles

    bucket = os.getenv("NEWS_DATA_BUCKET", "").strip()
    key = os.getenv("NEWS_DATA_CLEAN_KEY", "clean/clean-articles.json").strip()

    if not bucket:
        _cached_articles = load_local_fallback()
        _cached_loaded_at = now
        return _cached_articles

    try:
        response = s3_client.get_object(Bucket=bucket, Key=key)
        payload = json.loads(response["Body"].read().decode("utf-8"))
        _cached_articles = payload if isinstance(payload, list) else []
        _cached_loaded_at = now
        return _cached_articles
    except (BotoCoreError, ClientError, json.JSONDecodeError):
        _cached_articles = load_local_fallback()
        _cached_loaded_at = now
        return _cached_articles


def build_match_haystack(article: dict[str, Any]) -> str:
    return " ".join(
        [
            str(article.get("title") or ""),
            str(article.get("body") or ""),
            " ".join(article.get("keywordTokens") or []),
        ]
    ).lower()


def parse_limit(raw_limit: str | None) -> int:
    if not raw_limit:
        return 20

    try:
        limit = int(raw_limit)
    except ValueError:
        return 20

    return min(max(limit, 1), 100)


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    method = str(event.get("requestContext", {}).get("http", {}).get("method") or event.get("httpMethod") or "GET").upper()
    if method == "OPTIONS":
        return build_response(200, {"ok": True})

    keyword = get_query_param(event, "keyword")
    source_id = get_query_param(event, "sourceId")
    limit = parse_limit(get_query_param(event, "limit"))

    if not keyword:
        return build_response(400, {"message": "Query parameter 'keyword' is required."})

    normalized_keyword = keyword.lower()
    articles = load_clean_articles()

    matching_articles = [
        article
        for article in articles
        if normalized_keyword in build_match_haystack(article)
        and (source_id is None or str(article.get("sourceId")) == source_id)
    ]

    if not matching_articles:
        return build_response(
            200,
            {
                "keyword": keyword,
                "totalMatches": 0,
                "rankings": [],
                "articles": [],
            },
        )

    scored_articles: list[dict[str, Any]] = []
    for article in matching_articles:
        text = str(article.get("sentimentText") or article.get("body") or article.get("title") or "")
        scores = analyzer.polarity_scores(text)
        scored_articles.append(
            {
                "article": article,
                "scores": scores,
            }
        )

    outlets: dict[str, dict[str, Any]] = {}
    for entry in scored_articles:
        article = entry["article"]
        scores = entry["scores"]
        outlet = outlets.setdefault(
            str(article.get("sourceId")),
            {
                "sourceId": article.get("sourceId"),
                "sourceName": article.get("sourceName"),
                "articleCount": 0,
                "compoundScores": [],
                "positiveScores": [],
                "negativeScores": [],
                "neutralScores": [],
            },
        )
        outlet["articleCount"] += 1
        outlet["compoundScores"].append(scores["compound"])
        outlet["positiveScores"].append(scores["pos"])
        outlet["negativeScores"].append(scores["neg"])
        outlet["neutralScores"].append(scores["neu"])

    rankings: list[dict[str, Any]] = []
    for outlet in outlets.values():
        average_compound = mean(outlet["compoundScores"])
        rankings.append(
            {
                "sourceId": outlet["sourceId"],
                "sourceName": outlet["sourceName"],
                "articleCount": outlet["articleCount"],
                "averageCompound": round(average_compound, 4),
                "averagePositive": round(mean(outlet["positiveScores"]), 4),
                "averageNegative": round(mean(outlet["negativeScores"]), 4),
                "averageNeutral": round(mean(outlet["neutralScores"]), 4),
                "sentimentLabel": label_for_compound(average_compound),
            }
        )

    rankings.sort(key=lambda item: item["averageCompound"], reverse=True)
    top_articles = [
        {
            "sourceId": entry["article"].get("sourceId"),
            "sourceName": entry["article"].get("sourceName"),
            "title": entry["article"].get("title"),
            "summary": entry["article"].get("summary"),
            "publishedAt": entry["article"].get("publishedAt"),
            "url": entry["article"].get("url"),
            "compound": round(entry["scores"]["compound"], 4),
        }
        for entry in sorted(scored_articles, key=lambda item: item["scores"]["compound"], reverse=True)[:limit]
    ]

    payload = {
        "keyword": keyword,
        "totalMatches": len(matching_articles),
        "rankings": rankings,
        "articles": top_articles,
        "self": f"?{urlencode({'keyword': keyword, 'sourceId': source_id or '', 'limit': limit})}",
    }
    return build_response(200, payload)
