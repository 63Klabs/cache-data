# Lambda Optimizations

Get the most out of your Lambda function!

- Optimal performance is somewhere between 512MB and 1024MB. 1024MB is recommended.
- Utilize the arm64 architecture for Lambda

These are just general recommendations from AWS and the Lambda developer community. Increasing memory and using the arm64 architecture improves performance resulting in quicker execution (which can drive down cost). Further enhancing execution time is that fact that since you are most likely utilizing this package because you are calling external endpoints, the speed in which the requests occur can increase as well as additional memory opens up additional processor power, resulting in faster network speeds.

- Take care of initialization outside of handler
- Multi-task with async operations
- Reduce the number of packages

## Lambda Memory Allocation

As pointed out in many online resources, including [AWS's own documentation](https://docs.aws.amazon.com/lambda/latest/operatorguide/computing-power.html), Lambda applications should be given more than the default 128MB when using network resources and processing data. I recommend trying 512MB and adjusting depending on your workload and execution experiences. See [Lower AWS Lambda bill by increasing memory by Taavi Rehemägi](https://dashbird.io/blog/lower-aws-lambda-bill-increasing-memory/). 

Example: The charts below reflect 1 million requests over a seven-day period. As you can see, the invocations remained at a high level throughout the seven-day period. There was a dramatic drop in execution time once the memory was increased from 128 to 512MB. Latency was also improved. This also reduced the number of concurrent executions taking place. (The spike in errors was due to a 3rd party endpoint being down.)

![Metrics before and after upgrade to 512MB with 1M invocations over a 7 day period](https://github.com/63klabs/npm-cache-data/assets/17443749/0ec98af5-edcf-4e2a-8017-dd17b9c7a11c)

If you are worried about cost, the Lambda function demonstrated above handles approximately 4.6 million requests a month, each averaging 46ms in Lambda run time. This means that the Lambda function executes a total of 211,000 seconds a month which is still within the 400,000 seconds provided by the Free Tier. If there was no free tier, the cost would have been around USD $2.00.

## Use arm64 Architecture

Also, in regards to the AWS Graviton ARM architecture processor, Amazon touts that it is faster than the default processor, which when I switched seems to track.

