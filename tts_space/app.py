"""
Monoko — Lingala TTS Space
Model: DigitalUmuganda/lingala_vits_tts (ESPnet2 VITS, 71.6h real Lingala speech)
"""

import os
import tempfile
import traceback
import numpy as np
import torch
import soundfile as sf
import gradio as gr
from huggingface_hub import hf_hub_download
import nltk

# g2p_en (used by ESPnet2 VITS tokenizer) requires these NLTK resources
nltk.download('averaged_perceptron_tagger_eng', quiet=True)  # new name (NLTK >= 3.8)
nltk.download('averaged_perceptron_tagger', quiet=True)       # old name fallback
nltk.download('cmudict', quiet=True)

REPO_ID  = "DigitalUmuganda/lingala_vits_tts"
HF_TOKEN = os.environ.get("HF_TOKEN")

print(f"Downloading model files from {REPO_ID} …")
config_path = hf_hub_download(repo_id=REPO_ID, filename="config.yaml", token=HF_TOKEN)
model_path  = hf_hub_download(repo_id=REPO_ID, filename="train.total_count.best.pth", token=HF_TOKEN)
print("Files ready. Loading ESPnet2 Text2Speech …")

from espnet2.bin.tts_inference import Text2Speech

text2speech = Text2Speech(
    train_config=config_path,
    model_file=model_path,
    device="cpu",
)
SAMPLE_RATE = text2speech.fs if hasattr(text2speech, "fs") else 22050
print(f"Model ready — sample rate {SAMPLE_RATE} Hz")


def synthesise(text: str):
    """Generate Lingala speech. Returns WAV filepath."""
    print(f"[synthesise] input: {text!r}")
    try:
        if not text or not text.strip():
            return None
        with torch.no_grad():
            output = text2speech(text.strip())
        print(f"[synthesise] output keys: {list(output.keys())}")
        wav = output["wav"].numpy().astype(np.float32)
        print(f"[synthesise] wav shape: {wav.shape}, sr: {SAMPLE_RATE}")
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False, dir="/tmp")
        sf.write(tmp.name, wav, SAMPLE_RATE)
        print(f"[synthesise] saved to {tmp.name}")
        return tmp.name
    except Exception as e:
        print(f"[synthesise] ERROR: {e}")
        traceback.print_exc()
        raise


demo = gr.Interface(
    fn=synthesise,
    inputs=gr.Textbox(label="Texte Lingala", placeholder="Mbote na yo …", lines=2),
    outputs=gr.Audio(label="Audio Lingala"),
    title="Monoko — Lingala TTS",
    description="DigitalUmuganda/lingala_vits_tts · ESPnet2 VITS · 71.6h Lingala",
    api_name="synthesise",
)

# queue() is required in Gradio 6.x for the /gradio_api/call/ event-based API
demo.queue()

if __name__ == "__main__":
    demo.launch()
