"""
Gemini service for the dashboard backend.
- regenerate_stage: calls Gemini with the SINGLE-STAGE prompt (same format as llmService.py _PROMPT)
- translate_stage: enhanced Kannada translation prompt — accurate agricultural terminology
Does NOT modify the existing llmService.py or any finalized prompts.
"""
import json
import logging
import httpx

logger = logging.getLogger(__name__)

_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}"
    ":generateContent?key={api_key}"
)

_SYSTEM = (
    "You are an expert agronomist specialising in Indian crop production. "
    "Return ONLY a valid JSON object — no prose, no markdown fences."
)

# ── Single-stage regeneration (same schema as the finalized bulk prompt output) ─

_REGEN_PROMPT = """\
Crop      : {crop_name}
Phase     : {main_stage}
Sub-stage : {sub_stage_name}  (day {start_day}–{end_day} after sowing)

Return a valid JSON object with exactly 6 string keys. Keep each value informative and specific.

{{
  "susceptible_pests":    "<comma-separated list of major pests at this sub-stage>",
  "pest_risk_factors":    "<comma-separated agronomic and climatic conditions that increase pest risk>",
  "pest_management":      "Cultural: <2-3 practical field management practices>. Biological: <1-2 biocontrol agents or natural enemies>. Chemical: <specific chemical name, concentration and application method>.",
  "susceptible_diseases": "<comma-separated list of major diseases at this sub-stage>",
  "disease_risk_factors": "<comma-separated conditions that promote disease>",
  "disease_management":   "Cultural: <2-3 practical field management practices>. Biological: <1-2 biocontrol options>. Chemical: <specific chemical name, concentration and application method>."
}}

Be specific to {crop_name} at this exact sub-stage. Use Indian crop-protection context.\
"""

_REGEN_FALLBACK = {
    "susceptible_pests":    None,
    "pest_risk_factors":    None,
    "pest_management":      None,
    "susceptible_diseases": None,
    "disease_risk_factors": None,
    "disease_management":   None,
}

# ── Separate Environmental Conditions prompt (on-demand) ──────────────────────

_ENV_PROMPT = """\
Crop      : {crop_name}
Phase     : {main_stage}
Sub-stage : {sub_stage_name}  (day {start_day}–{end_day} after sowing)

Return ONLY a valid JSON object with exactly one key "env_conditions" containing an object with these 11 fields.
Values should be specific to {crop_name} at this exact growth sub-stage in India.

{{
  "env_conditions": {{
    "uv_index":          "<e.g. Moderate to High (5-9)>",
    "temp_max_c":        "<number, e.g. 35>",
    "temp_min_c":        "<number, e.g. 20>",
    "photoperiod":       "<e.g. 12-14 hours>",
    "soil_temp_c":       "<range, e.g. 22-30>",
    "irrigation_mm":     "<per-week range, e.g. 25-50>",
    "optimal_temp_c":    "<range, e.g. 25-32>",
    "avg_yield_kg_ha":   "<expected yield at harvest or 0 if pre-harvest stage>",
    "rel_humidity_pct":  "<range, e.g. 60-80>",
    "harvest_index_pct": "<0 to 100 depending on stage>",
    "soil_moisture_pct": "<description or range, e.g. 25-35%>"
  }}
}}\
"""

_ENV_FALLBACK = {"env_conditions": None}

# ── Enhanced Kannada translation prompt ──────────────────────────────────────
# Does NOT touch llmService.py — lives only in this file.

_KN_LANGUAGE_NAMES = {
    "kn": "Kannada", "hi": "Hindi", "gu": "Gujarati", "ta": "Tamil",
    "te": "Telugu", "mr": "Marathi", "pa": "Punjabi", "bn": "Bengali",
    "ml": "Malayalam", "or": "Odia", "en": "English",
}

_TRANSLATE_PROMPT = """\
You are an expert agricultural extension officer fluent in {language_name}, working with
farmers in {region}. Translate the following Indian crop advisory content into {language_name}.

Rules:
1. Use regional agricultural terms that farmers in {region} actually use — NOT literal
   word-for-word translations. For example, use common local names for pests and diseases.
2. Retain English/Latin names of chemical pesticides and active ingredients in brackets
   after the {language_name} text so farmers can find them at their local agro store.
   Example: ಇಮಿಡಾಕ್ಲೋಪ್ರಿಡ್ (Imidacloprid 17.8% SL)
3. Keep numbers, percentages, and dosages unchanged.
4. Translate clearly and concisely — do not add explanations or padding.
5. Return ONLY a JSON object with these exact keys, no extra text:

{{
  "crop_name_local":    "<crop name in {language_name}>",
  "phase_name_local":   "<phase/main-stage name in {language_name}>",
  "stage_name_local":   "<sub-stage name in {language_name}>",
  "pest_data_local":    "<full pest susceptibility and management in {language_name}>",
  "disease_data_local": "<full disease susceptibility and management in {language_name}>",
  "env_data_local":     "<environmental conditions summary in {language_name}, or null if empty>"
}}

--- Source content (English) ---
Crop        : {crop_name}
Phase       : {phase_name}
Sub-stage   : {stage_name}
Pest data   : {pest_text}
Disease data: {disease_text}
Env data    : {env_text}
"""

_TRANSLATE_FALLBACK = {
    "crop_name_local": None, "phase_name_local": None, "stage_name_local": None,
    "pest_data_local": None, "disease_data_local": None, "env_data_local": None,
}

_REGION_MAP = {
    "kn": "Karnataka, India",
    "hi": "North India",
    "gu": "Gujarat, India",
    "ta": "Tamil Nadu, India",
    "te": "Andhra Pradesh/Telangana, India",
    "mr": "Maharashtra, India",
    "pa": "Punjab, India",
    "bn": "West Bengal, India",
    "ml": "Kerala, India",
    "or": "Odisha, India",
}


# ── Shared Gemini caller ──────────────────────────────────────────────────────

def repair_gemini_json(raw: str, keys: list) -> str:
    positions = []
    for k in keys:
        idx = raw.find(f'"{k}"')
        if idx == -1:
            idx = raw.find(f"'{k}'")
        if idx != -1:
            positions.append((k, idx))
            
    positions.sort(key=lambda x: x[1])
    
    if len(positions) < 2:
        return raw

    repaired_parts = []
    for i in range(len(positions)):
        k, start_idx = positions[i]
        colon_idx = raw.find(":", start_idx)
        if colon_idx == -1:
            continue
        val_start_quote = raw.find('"', colon_idx)
        if val_start_quote == -1:
            val_start_quote = raw.find("'", colon_idx)
            
        if val_start_quote == -1:
            continue
            
        if i + 1 < len(positions):
            val_end = positions[i+1][1]
        else:
            val_end = raw.rfind("}")
            
        val_segment = raw[val_start_quote:val_end].strip()
        
        closing_quote_idx = -1
        if val_segment.endswith(","):
            closing_quote_idx = val_segment.rstrip(",").rstrip().rfind('"')
            if closing_quote_idx == -1:
                closing_quote_idx = val_segment.rstrip(",").rstrip().rfind("'")
        else:
            closing_quote_idx = val_segment.rfind('"')
            if closing_quote_idx == -1:
                closing_quote_idx = val_segment.rfind("'")
                
        if closing_quote_idx > 0:
            inner_text = val_segment[1:closing_quote_idx]
            inner_text_repaired = inner_text.replace('"', "'")
            # Convert raw newlines to escaped \n
            inner_text_repaired = inner_text_repaired.replace('\n', '\\n')
            repaired_parts.append(f'"{k}": "{inner_text_repaired}"')
        else:
            repaired_parts.append(f'"{k}": ""')
            
    return "{\n  " + ",\n  ".join(repaired_parts) + "\n}"


async def _call_gemini(
    prompt: str,
    fallback: dict,
    api_key: str,
    model: str,
    max_tokens: int = 2048,
) -> dict:
    if not api_key:
        logger.warning("GEMINI_API_KEY not set — skipping LLM call")
        return fallback.copy()

    payload = {
        "system_instruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                _API_URL.format(model=model, api_key=api_key),
                json=payload,
                headers={"content-type": "application/json"},
            )
            resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        logger.error("Gemini API %s: %s", e.response.status_code, e.response.text[:300])
        return fallback.copy()
    except httpx.RequestError as e:
        logger.error("Gemini request failed: %s", e)
        return fallback.copy()

    raw = ""
    try:
        body = resp.json()
        raw = body["candidates"][0]["content"]["parts"][0]["text"].strip()

        # Strip markdown fences if Gemini added them despite responseMimeType
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:].strip()

        # ── Strategy 1: direct parse (works when Gemini returns clean JSON) ──
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # ── Strategy 2: lenient parse (handles minor escaping issues) ──
            try:
                data = json.loads(raw, strict=False)
            except json.JSONDecodeError:
                # ── Strategy 3: repair heuristic as last resort ──
                logger.warning("Direct JSON parse failed, attempting repair heuristic")
                repaired = repair_gemini_json(raw, list(fallback.keys()))
                data = json.loads(repaired, strict=False)

    except (KeyError, IndexError) as e:
        logger.error("Unexpected Gemini response structure: %s", e)
        return fallback.copy()
    except json.JSONDecodeError as e:
        logger.error("Failed to parse Gemini response even after repair: %s | raw[:200]=%s", e, raw[:200])
        return fallback.copy()
    except Exception as e:
        logger.error("Unexpected error parsing Gemini response: %s", e)
        return fallback.copy()

    result = fallback.copy()
    result.update({k: v if v else None for k, v in data.items() if k in result})
    return result


# ── Public API ────────────────────────────────────────────────────────────────

async def regenerate_stage(
    *,
    crop_name: str,
    main_stage: str,
    sub_stage_name: str,
    start_day: int,
    end_day: int,
    api_key: str,
    model: str,
) -> dict:
    """Generate fresh pest/disease data for a single stage via Gemini."""
    prompt = _REGEN_PROMPT.format(
        crop_name=crop_name,
        main_stage=main_stage,
        sub_stage_name=sub_stage_name,
        start_day=start_day,
        end_day=end_day,
    )
    return await _call_gemini(prompt, _REGEN_FALLBACK, api_key, model, max_tokens=2048)


async def generate_env_conditions(
    *,
    crop_name: str,
    main_stage: str,
    sub_stage_name: str,
    start_day: int,
    end_day: int,
    api_key: str,
    model: str,
):
    """Separately generate env_conditions for a single stage (on-demand)."""
    if not api_key:
        logger.warning("GEMINI_API_KEY not set — skipping env conditions call")
        return None

    prompt = _ENV_PROMPT.format(
        crop_name=crop_name,
        main_stage=main_stage,
        sub_stage_name=sub_stage_name,
        start_day=start_day,
        end_day=end_day,
    )
    payload = {
        "system_instruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 1024,
            "temperature": 0.1,
            "responseMimeType": "application/json",
        },
    }

    raw = ""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                _API_URL.format(model=model, api_key=api_key),
                json=payload,
                headers={"content-type": "application/json"},
            )
            resp.raise_for_status()

        body = resp.json()
        candidate = body.get("candidates", [{}])[0]

        # Guard: Gemini may omit 'content' when finishReason is SAFETY/OTHER
        if "content" not in candidate:
            finish = candidate.get("finishReason", "UNKNOWN")
            logger.error("Gemini env: no content in response, finishReason=%s", finish)
            return None

        raw = candidate["content"]["parts"][0]["text"].strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:].strip()

        data = json.loads(raw)

        # Handle both {"env_conditions": {...}} and direct {...} response formats
        env = data.get("env_conditions", data)
        if isinstance(env, dict) and env:
            return env
        return None

    except httpx.HTTPStatusError as e:
        logger.error("Gemini env API %s: %s", e.response.status_code, e.response.text[:200])
        return None
    except Exception as e:
        logger.error("Failed to generate env conditions: %s | raw[:200]=%s", e, raw[:200])
        return None


async def translate_stage(
    *,
    crop_name: str,
    phase_name: str,
    stage_name: str,
    pest_text: str,
    disease_text: str,
    env_text: str,
    language_code: str,
    api_key: str,
    model: str,
) -> dict:
    """Translate a single stage's advisory text into the target language with high accuracy."""
    lang_name = _KN_LANGUAGE_NAMES.get(language_code, language_code)
    region    = _REGION_MAP.get(language_code, "India")

    prompt = _TRANSLATE_PROMPT.format(
        language_name=lang_name,
        region=region,
        crop_name=crop_name,
        phase_name=phase_name,
        stage_name=stage_name,
        pest_text=pest_text or "N/A",
        disease_text=disease_text or "N/A",
        env_text=env_text or "N/A",
    )
    return await _call_gemini(prompt, _TRANSLATE_FALLBACK, api_key, model, max_tokens=3000)


# ── New Crop Stages Template Discovery ───────────────────────────────────────

_STAGES_TEMPLATE_PROMPT = """\
Crop: {crop_name}

You are an expert agronomist specialising in Indian agriculture. 
Generate a list of standard, realistic growth phases and sub-stages for the crop "{crop_name}" from planting to harvest in India.
Include 3 to 4 main growth phases (e.g., Vegetative, Reproductive, Maturity) and 1 to 2 sub-stages per phase.
Ensure that the day ranges (start_day to end_day) are sequential, continuous (i.e. start_day of next stage is end_day + 1 of previous stage), start at day 0, and cover the typical crop duration.

Return ONLY a valid JSON object with exactly this schema (no markdown, no other text):
{{
  "stages": [
    {{
      "main_stage": "<Phase name, e.g., Vegetative Phase>",
      "sub_stage_name": "<Sub-stage name, e.g., Seedling Establishment>",
      "start_day": <integer>,
      "end_day": <integer>
    }},
    ...
  ]
}}
"""

async def generate_crop_stages_template(
    *,
    crop_name: str,
    api_key: str,
    model: str,
) -> list[dict]:
    """Generate a template list of growth phases and sub-stages for a new crop."""
    if not api_key:
        logger.warning("GEMINI_API_KEY not set — skipping stages template call")
        return []

    prompt = _STAGES_TEMPLATE_PROMPT.format(crop_name=crop_name)
    payload = {
        "system_instruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 2048,
            "temperature": 0.2,
            "responseMimeType": "application/json",
        },
    }

    raw = ""
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                _API_URL.format(model=model, api_key=api_key),
                json=payload,
                headers={"content-type": "application/json"},
            )
            resp.raise_for_status()

        raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()

        # Strip markdown fences
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:].strip()

        data = json.loads(raw)
        stages = data.get("stages", [])
        return stages if isinstance(stages, list) else []

    except httpx.HTTPStatusError as e:
        logger.error("Gemini stages API %s: %s", e.response.status_code, e.response.text[:300])
        return []
    except httpx.RequestError as e:
        logger.error("Gemini stages request failed: %s", e)
        return []
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logger.error("Failed to parse stages template response: %s | raw[:200]=%s", e, raw[:200])
        return []

