import flask
from flask import jsonify
import torch
from datetime import datetime
import whisperx
import sagemaker
from sagemaker.s3 import S3Downloader, S3Uploader
import json
import os


app = flask.Flask(__name__)

DEVICE = "cuda" if {torch.cuda.is_available() and print(torch.cuda.get_device_name())} else "cpu"


def transcribe(currfile, curr_model="large-v2", batch_size = 16, compute_type= "float16"):
    
    print("currfile type: ",type(currfile))

    try:
      whisperx_model = whisperx.load_model(curr_model, DEVICE, compute_type=compute_type, language="en", asr_options={"word_timestamps":True, "without_timestamps":True})

      start = datetime.now()

      result = whisperx_model.transcribe(currfile, batch_size=batch_size)

      model_a, metadata = whisperx.load_align_model(language_code=result["language"], device=DEVICE)
      
      
      result = whisperx.align(result["segments"], model_a, metadata, currfile, DEVICE, return_char_alignments=False)

      print("Transcription: ", result['word_segments'])

      end = datetime.now()
      
      total_time = (end-start).total_seconds()
      
      return {"result":result, "time":total_time}
      
    except Exception as e:
        print("Error transcribing: ", e)
        
        
@app.route('/invocations', methods=["POST"])
def invoke():
    try:
        sm_session = sagemaker.session.Session()
        
        print("data type: ", flask.request.content_type)
        
        print("request:", flask.request)
        data = flask.request.get_json(force=True)
        
        print("data:",data)
        print("type:",type(data))
        
        file_uri = data.get("file_uri")
        output_target = data.get("output_target")
        filename = data.get("filename")
        output_name = data.get("output_name")
    
    
        print("file_uri:", file_uri)
        print("output_target:", output_target)
        print("filename:", filename)
        print("output_name:", output_name)
        
        S3Downloader.download(file_uri, "./" , sagemaker_session=sm_session)
        
        transcribed = transcribe(filename)
        print("transcription:", transcribed)
        
        with open(output_name, "w") as outfile:
            outfile.write(json.dumps(transcribed))
        
        S3Uploader.upload(output_name, output_target, sagemaker_session=sm_session )
        
        return flask.Response(transcribed, content_type="application/json")
        
        # f = io.BytesIO(flask.request.data)
#         filename= "temp.mp4"
#         if os.path.isfile(filename):
#             os.remove(filename)

#         out_file = open(filename, "wb") # open for [w]riting as [b]inary
#         out_file.write(flask.request.data)
#         out_file.close()
    
#         transcribed = transcribe(filename)
#         print("transcription:", transcribed)
        
#         return flask.Response(transcribed, content_type="application/json")
    
    except Exception as e:
        print("Error:",e)


@app.route('/ping', methods=["GET"])
def ping():
    return flask.Response("test")


if __name__ == '__main__':
    port = 8080
    print("Running server on Port: ", port)
    app.run(host="0.0.0.0", port=port)