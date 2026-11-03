# Explainable Multimodal Clinical Diagnosis — CNN + ANFIS + LLM

An explainable, multimodal clinical diagnosis support system for brain MRI, skin
dermoscopy, and retinal OCT. Combines CNN feature extraction, a learned bottleneck,
and a custom ANFIS (Adaptive Neuro-Fuzzy Inference System) layer for interpretable,
rule-based predictions — paired with a tool-calling LLM agent for natural-language
explanation and sourced medical guidance.

> ⚠️ **Decision support only.** This system is a student/academic project and is
> **not** a certified medical device. It must never be used for real diagnosis.

---

## Why this project

Standard CNN classifiers are accurate but opaque — they give a label with no
auditable reasoning. Classic fuzzy-rule systems are interpretable but can't process
raw images and need hand-built rules, which causes "rule explosion" when applied
directly to high-dimensional CNN features.

This project bridges the two: a CNN extracts visual features, a bottleneck layer
compresses them into 4 clinically-meaningful parameters, and an ANFIS layer turns
those into a small set of human-readable IF-THEN rules — keeping the rule count to
81 (3⁴) instead of exploding combinatorially.

## Architecture
Image → CNN (ResNet18) → Bottleneck (512→4) → ANFIS (81 fuzzy rules) → Prediction
↓ ↓
[+ Segmentation head] Fired rules + confidence
(brain & skin only) ↓
LLM Agent (Gemini)
tool-calling: analyse_scan,
get_condition_info, list_rules,
model_performance, web_lookup
↓
Plain-language explanation +
sourced next steps

## Results

| Organ | Dataset | Classes | Test Accuracy | Macro-F1 | Segmentation Dice | Notes |
|---|---|---|---|---|---|---|
| Brain | BRISC 2025 | 4 (glioma, meningioma, pituitary, no tumor) | 96.9% | 0.972 | 0.541 | Dataset leakage found & removed (249 images); shape shortcut detected & mitigated |
| Skin | HAM10000 | 3 (malignant, benign, vascular — collapsed from 7) | 76.0%† | 0.647 | 0.827 | 7-class attempt failed (F1 0.26); threshold tuned to favour catching malignant lesions |
| Retina | Kermany OCT | 4 (CNV, DME, drusen, normal) | 94.2% | 0.931 | n/a‡ | Original dataset split had 88% patient leakage; rebuilt patient-level split |

† Accuracy is secondary here — the model is deliberately tuned for malignant
recall (79%) over raw accuracy, since missing a cancer is worse than a false alarm.
‡ No public segmentation masks exist for this dataset, so parameters were learned
from the classification signal alone rather than mask-supervised.

## What makes this different from a typical student CV project

- **Found and fixed real dataset problems** rather than taking benchmarks at face
  value: BRISC's leaked train/test images, HAM10000's 45% duplicate-lesion rate,
  and the OCT dataset's 88% patient overlap between its official train/test splits
  (both detected via custom duplicate/leakage-detection notebooks and corrected
  with patient-grouped splits).
- **Measured, not assumed, interpretability**: Grad-CAM was tested against ground-truth
  tumour masks and found to localise poorly (14% peak accuracy), so it was replaced
  with a trained segmentation head (55% — a 4x improvement), with both results
  reported honestly.
- **Quantified the accuracy/interpretability trade-off** directly, rather than
  reporting one cherry-picked number — see `/notebooks` for the full before/after
  comparison tables.
- **Three different interpretability stories per organ**: brain & skin have
  mask-supervised, verified fuzzy parameters; retina's were learned end-to-end and
  are explicitly flagged as less rigorously grounded.

## Tech stack

**ML / Training**
PyTorch · torchvision (ResNet18) · custom ANFIS layer (Gaussian membership
functions, fuzzy rule layer) · U-Net-style segmentation decoder · Grad-CAM ·
scikit-learn · trained on Google Colab (free T4 GPU)

**Backend**
FastAPI · Python · Google Gemini API (function calling / tool use, web search
grounding) · session-based chat

**Frontend**
React · Vite · Axios

## Project structure
anfis-clinical-diagnosis/
├── notebooks/ # Colab training notebooks (one per organ) — the full
│ # development record: data cleaning, leakage checks,
│ # training, evaluation
├── models/
│ ├── model.py # shared CNN+Bottleneck+ANFIS(+segmentation) architecture
│ └── *_config.json # per-organ class names, fuzzy rules, metrics
│ # (trained .pt weights not included — see models/README.md)
├── backend/
│ ├── predict.py # model inference + per-organ decision logic
│ ├── api.py # FastAPI endpoints: /predict /chat /organs
│ ├── tools.py # LLM tool definitions (analyse_scan, web_lookup, etc.)
│ └── agent.py # LLM agent loop with retries
├── knowledge/ # sourced condition info (NHS/RNIB) — what the LLM may state
└── frontend/ # React app: upload → results → chat


## Running it locally

### 1. Regenerate the model weights (Colab)
The trained `.pt` files are not included (size + HAM10000's CC BY-NC licence).
Open each notebook in `/notebooks` on Google Colab, run it top to bottom (free GPU
tier), and download the resulting `<organ>_model.pt` + `<organ>_config.json` into
`/models`.

### 2. Backend
```bash
pip install -r requirements.txt
echo "GEMINI_API_KEY=your_key_here" > .env
python -m uvicorn backend.api:app --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

## Known limitations

- Skin model: tuned for cancer-detection sensitivity, so malignant-flag precision
  is low (~45%) — expect frequent false positives, a deliberate trade-off (see
  `/notebooks/02_train_skin.ipynb`).
- Retina model has no segmentation/outline overlay (no public masks for this
  dataset) and its fuzzy parameters are named post-hoc rather than mask-verified.
- Single-slice/single-image analysis only — not a full clinical scan review.
- LLM explanations depend on Google's Gemini API free tier, which is rate-limited.

