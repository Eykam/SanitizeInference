import os
import uuid
import json
import time
from datetime import datetime
import sagemaker
from sagemaker.s3 import S3Downloader
import json
import boto3
from sagemaker import get_execution_role
import sys
import traceback

class InferenceEndpoint():
    
    def __init__(self) -> None:
        self.boto_session = boto3.session.Session()
        self.sm_session = sagemaker.session.Session(self.boto_session)
        self.sm_client = self.boto_session.client("sagemaker")
        self.sm_runtime = self.boto_session.client("sagemaker-runtime")

        self.deployment_name = "sanitize-endpoint-test-v2"
        self.bucket_prefix = "sanitize-inference-store"
        self.s3_bucket = self.sm_session.default_bucket()
        
        
        
    def predict(self, media_file, content_type):
        
        io_locations = self.upload_file(media_file, content_type)
       
       
        response = self.sm_runtime.invoke_endpoint_async(
            EndpointName=self.deployment_name, InputLocation=io_locations['input'],
        )

        output_location = io_locations['output']
        
        output = self.get_output(output_location)
        
        return self.read_output(output)
        
        

        

    def upload_file(self, input_location, content_type):
        prefix = f"{self.bucket_prefix}/input"
        
        output_id = str(uuid.uuid4())

        s3_media_location = self.sm_session.upload_data(
            input_location,
            bucket=self.s3_bucket,
            key_prefix=prefix,
            extra_args={"ContentType": content_type})
        
        
        # Hack to get SageMaker container to access file correctly, by stripping ./uploads/ from ./uploads/<filename> 
        input_location = input_location.split("/")[2]
        
        data = {"file_uri":s3_media_location , "output_target": f"s3://{self.s3_bucket}/{self.bucket_prefix}/output", "filename":input_location, "output_name": output_id + ".json"}
            
        input_uri =  self.sm_session.upload_string_as_file_body(
            json.dumps(data),
            bucket=self.s3_bucket,
            key=prefix + "/"+ output_id + ".json")
        
        return {"input" : input_uri, "output" :  data['output_target'] + "/" + data['output_name']}
    
    


    def get_output(self, output_location):
        
        start = datetime.now()
        while True:
                output = S3Downloader.download(output_location, "./", sagemaker_session=self.sm_session)
                if len(output) > 0:
                    end = datetime.now()
                    total_time = (end-start).total_seconds()
                    return [output[0], total_time]
                else:
                    time.sleep(2)
                    continue


    def read_output(self, output):
        output_file = output[0] ### removed double indexing test again by checking what output param is being passed in 
        data = {}
        
        with open(output_file) as json_file:
            data = json.load(json_file)

        def restructure(curr):
            if "word" in curr:
                curr["text"] = curr["word"]
                curr.pop("word")
            if "score" in curr:
                curr.pop('score')
            return curr

        transcription = list(map(restructure, data["result"]["word_segments"]))
        
        
        return [data["time"], transcription]


    def check_endpoint(self):
        response = self.sm_client.describe_endpoint(
            EndpointName=self.deployment_name
        )
        
        response = response['ProductionVariants'][0]
        # print("currCount:", response['CurrentInstanceCount'])
        # print("desiredCount:" , response['DesiredInstanceCount'])
        


def main():
    ### PARSE CLI INPUTS TO GET FILE PATH AND FILE TYPE TO RUN INFERENCE ON
    try:
        file_location =  sys.argv[1]
        content_type = sys.argv[2]
        
        endpoint = InferenceEndpoint()
    
        results = endpoint.predict(file_location, content_type)
        
        print(results)
    
    except Exception as e:
        # print("Error hitting async inference endpoint: ", e)
        print(traceback.format_exc())
        exit(1)
    

if __name__ == "__main__":
    main()