from profanity_check import predict, predict_prob
import sys
import json
import re

try:
    wordList = sys.argv[1]

    testArr = wordList.replace("[", "").replace("]","").replace(" ", "").split(",")
    results = predict(testArr)
    
    badWords = []
    for x in range(0, len(results)):
        if results[x] or re.match(r"[\*]", testArr[x]) != None:
            badWords.append(testArr[x])
    
    print(badWords)
    
except Exception as e:
    
    print("Error finding badWords (python): ", e)

