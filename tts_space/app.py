"""
Monoko — Lingala TTS Space
Wraps facebook/mms-tts-lin as a Gradio API endpoint.

API endpoint (Gradio 4.x):
  POST /call/synthesise   → { event_id }
  GET  /call/synthesise/{event_id}  → SSE → audio file URL
"""

import os
import numpy as np
import torch
import gradio as gr
from transformers import VitsModel, AutoTokenizer

MODEL_ID = "facebook/mms-tts-lin"
HF_TOKEN = os.environ.get("HF_TOKEN")  # set in Space Settings → Secrets

print("Loading facebook/mms-tts-lin …")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)
model = VitsModel.from_pretrained(MODEL_ID, token=HF_TOKEN)
model.eval()
SAMPLE_RATE = model.config.sampling_rate  # 16 000 Hz
print(f"Model ready — sample rate {SAMPLE_RATE} Hz")


def synthesise(text: str):
    """Generate Lingala speech from text. Returns (sample_rate, waveform)."""
    if not text or not text.strip():
        return None
    inputs = tokenizer(text.strip(), return_tensors="pt")
    with torch.no_grad():
        waveform = model(**inputs).waveform   # shape: (1, num_samples)
    audio = waveform.squeeze().numpy().astype(np.float32)
    return (SAMPLE_RATE, audio)


demo = gr.Interface(
    fn=synthesise,
    inputs=gr.Textbox(
        label="Texte Lingala",
        placeholder="Motema moko …",
        lines=2,
    ),
    outputs=gr.Audio(label="Audio", type="numpy"),
    title="Monoko — Lingala TTS",
    description="Synthèse vocale Lingala · facebook/mms-tts-lin",
    api_name="synthesise",   # → /call/synthesise in Gradio 4.x API
    allow_flagging="never",
)

if __name__ == "__main__":
    demo.launch()
