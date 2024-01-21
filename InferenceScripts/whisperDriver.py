import sys
# import whisper
from faster_whisper import WhisperModel

model_size = "large-v2"
audio_file =  sys.argv[1]

try:
    # Run on GPU with FP16
    model = WhisperModel(model_size, device="cuda", compute_type="float16")

    #, beam_size=1
    segments, _ = model.transcribe(audio_file, word_timestamps=True, condition_on_previous_text= False, language = "en")

    transcribed = []

    for segment in segments:
        for word in segment.words:
            transcribed.append({"text":word.word ,"start": round(word.start, 2), "end": round(word.end, 2)})

    print(transcribed, flush=True)
except Exception as e:
    print(e, flush=True)
    exit(1)