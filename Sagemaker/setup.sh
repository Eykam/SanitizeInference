python -m pip install --upgrade pip 
pip install -U awscli
pip install sagemaker --upgrade

aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 763104351884.dkr.ecr.us-east-1.amazonaws.com
docker build -t sanitize-container .