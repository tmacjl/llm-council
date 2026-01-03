"""OpenRouter API client for making LLM requests."""

import httpx
from typing import List, Dict, Any, Optional
from .config import OPENROUTER_API_KEY, OPENROUTER_API_URL


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0,
    online: bool = False,
    web_engine: Optional[str] = None,
    web_max_results: int = 5,
    web_search_prompt: Optional[str] = None,
    web_search_context_size: Optional[str] = None,
    extra_plugins: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API.

    Args:
        model: OpenRouter model identifier (e.g., "openai/gpt-4o")
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds
        online: Enable OpenRouter web search plugin grounding for this request
        web_engine: Optional web engine override: "native" | "exa" | None
        web_max_results: Max number of web results (defaults to 5)
        web_search_prompt: Optional prompt prefix for attaching web results
        web_search_context_size: Optional native search context size: "low" | "medium" | "high"
        extra_plugins: Optional additional OpenRouter plugins to enable for this request

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed
    """
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
    }

    plugins_payload: List[Dict[str, Any]] = []

    # Enable OpenRouter Web Search plugin (aka :online model variant)
    if online:
        web_plugin: Dict[str, Any] = {"id": "web"}
        if web_engine is not None:
            web_plugin["engine"] = web_engine
        if web_max_results is not None:
            web_plugin["max_results"] = int(web_max_results)
        if web_search_prompt is not None:
            web_plugin["search_prompt"] = web_search_prompt
        plugins_payload.append(web_plugin)

    # Allow callers to enable other plugins in the same request
    if extra_plugins:
        plugins_payload.extend(extra_plugins)

    if plugins_payload:
        payload["plugins"] = plugins_payload

    # Some providers support native web search context sizing
    if web_search_context_size is not None:
        payload["web_search_options"] = {
            "search_context_size": web_search_context_size
        }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                OPENROUTER_API_URL,
                headers=headers,
                json=payload
            )
            response.raise_for_status()

            data = response.json()
            message = data['choices'][0]['message']

            return {
                'content': message.get('content'),
                'reasoning_details': message.get('reasoning_details'),
                'annotations': message.get('annotations')
            }

    except Exception as e:
        print(f"Error querying model {model}: {e}")
        return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]],
    timeout: float = 120.0,
    online: bool = False,
    web_engine: Optional[str] = None,
    web_max_results: int = 5,
    web_search_prompt: Optional[str] = None,
    web_search_context_size: Optional[str] = None,
    extra_plugins: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel.

    Args:
        models: List of OpenRouter model identifiers
        messages: List of message dicts to send to each model

    Returns:
        Dict mapping model identifier to response dict (or None if failed)
    """
    import asyncio

    # Create tasks for all models
    tasks = [
        query_model(
            model,
            messages,
            timeout=timeout,
            online=online,
            web_engine=web_engine,
            web_max_results=web_max_results,
            web_search_prompt=web_search_prompt,
            web_search_context_size=web_search_context_size,
            extra_plugins=extra_plugins,
        )
        for model in models
    ]

    # Wait for all to complete
    responses = await asyncio.gather(*tasks)

    # Map models to their responses
    return {model: response for model, response in zip(models, responses)}
