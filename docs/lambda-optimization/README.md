# Lambda Optimizations

Get the most out of your Lambda function!

- Optimal performance is somewhere between 512MB and 1024MB. 1024MB is recommended.
- Utilize the arm64 architecture for Lambda

These are just general recommendations from AWS and the Lambda developer community. Increasing memory and using the arm64 architecture improves performance resulting in quicker execution (which can drive down cost). Further enhancing execution time is that fact that since you are most likely utilizing this package because you are calling external endpoints, the speed in which the requests occur can increase as well as additional memory opens up additional processor power, resulting in faster network speeds.

Utilize the following best practices:

- Take care of initialization outside of handler
- Multi-task with async operations
- Reduce the number of packages
- Turn on X-Ray tracing

## Lambda Memory Allocation

As pointed out in many online resources, including [AWS's own documentation](https://docs.aws.amazon.com/lambda/latest/operatorguide/computing-power.html), Lambda applications should be given more than the default 128MB when using network resources and processing data. I recommend trying 512MB and adjusting depending on your workload and execution experiences. See [Lower AWS Lambda bill by increasing memory by Taavi Rehemägi](https://dashbird.io/blog/lower-aws-lambda-bill-increasing-memory/). 

Example: The charts below reflect 1 million requests over a seven-day period. As you can see, the invocations remained at a high level throughout the seven-day period. There was a dramatic drop in execution time once the memory was increased from 128 to 512MB. Latency was also improved. This also reduced the number of concurrent executions taking place. (The spike in errors was due to a 3rd party endpoint being down.)

![Metrics before and after upgrade to 512MB with 1M invocations over a 7 day period](https://github.com/63klabs/npm-cache-data/assets/17443749/0ec98af5-edcf-4e2a-8017-dd17b9c7a11c)

If you are worried about cost, the Lambda function demonstrated above handles approximately 4.6 million requests a month, each averaging 46ms in Lambda run time. This means that the Lambda function executes a total of 211,000 seconds a month which is still within the 400,000 seconds provided by the Free Tier. If there was no free tier, the cost would have been around USD $2.00.

## Use arm64 Architecture

In regards to the AWS Graviton ARM architecture processor, Amazon touts that it is faster than the default processor and recommends its use.

When I switching over to arm64 I did see a performance improvement.

Note that if you are using precompiled packages, they must be compatible with arm64. For example, cache-data works with Lambda Insights and Lambda X-Ray layers. When specifying these Lambda Layers to be used by your function you must specify either the standard version or the arm64 version.

## Initialize Outside of Handler

Run code that initializes your function outside of the handler. If you need to load in secrets from parameter store, load configuration files, and initialize objects, do this at the top of the script that contains your handler script (typically src/index.js).

All code outside of the handler function is executed when the script is loaded during a cold start.

This will increase the cold start time (which is typically just a few hundred milliseconds) but will perform better on subsequent calls.

Common practice for cache-data is to implement the Config and Cache init in a Configuration script that is imported at the top of the index script and then checked for completion before executing the handler.

- [index.js example for handler](../00-example-implementation/example-handler.js)
- [configuration example](../00-example-implementation/example-config.js)

## Multi-task with async operations

Since the cache-data package is built for calling remote endpoints, it utilizes asynchronous functions so that your code doesn't have to wait for a response to perform other tasks that do not require the fetched data right away.

Async is like doing laundry. When you put a load into the washer, you don't sit there staring at the machine with your hands folded, waiting while it completes all wash cycles. You put a load and then perform other chores until it signals that it is done. Then you put the clothes in the dryer (or hang on a line) and as they dry you perform other tasks.

But you can't dry your clothes before you wash them, and you can't fold and put away your clothes until they are dry. So there are some tasks that require a previous step to be completed first.

Cache-data operates like a laundromat with many washers and dryers so that you are never waiting for a single load to complete before starting the next.

If you need to gather data from multiple endpoints, and the data from one doesn't rely on the data from another, you can dispatch multiple requests at once and wait for all to complete before moving on.

Also, you can dispatch the requests, proceed with other processes, and then come back and check on the request before proceeding. This is done in the example index.js code. The configuration is initialized and left to run on its own as the script continues on performing other tasks. This bides time (maybe just a few milliseconds) to proceed with other work before checking to ensure that all initialization tasks have completed before proceeding.

## Reduce the Number of Packages Your Function Requires

When you deploy your function you perform an `npm install` in your buildspec or GitHub actions script. Ensure that you only deploy production dependencies as you do not need `devDependencies` included with your deployed Lambda function. 

`devDependencies` should only be used for local development and testing. 

Including all dev packages (sometimes just even 5 will result in hundreds of sub-dependencies being installed) with your deployment will:

- Create a large function package with longer cold starts
- Likely reach the size limit for being able to inspect code via the Lambda console
- Introduce security vulnerabilities

To prevent `devDependencies` from deploying, you can:

- set the `NODE_ENV` environment variable for your GitHub Action or AWS CodeBuild environment to `production`
- run the install with the `--` flag: `npm install --`

If you are performing automated tests during the build in CodeBuild or GitHub Actions, then you can perform an install with `devDependencies` first, run the tests, and then perform a prune command to remove the extra packages.

```yaml
# buildspec.yml

version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: latest
    commands:

	# ...

  pre_build:
    commands:

      # Install dev so we can run tests, but we will remove dev dependencies later
      - npm install --include=dev

      # Run Test
      - npm test

      # Remove dev dependencies, keep only production
      - npm prune --omit=dev

  build:
    commands:
      - aws cloudformation package --template template.yml --s3-bucket $S3_ARTIFACTS_BUCKET --output-template template-export.yml

	# ...
```

## Turn on X-Ray and Lambda Insights for Monitoring

The cache-data package works with X-Ray and Lambda Insights for monitoring your application performace.

When enabled, X-Ray will trace requests as it moves through your application resources. Each resource needs to have tracing enabled. When a request comes through it is given a unique request identifier which is passed from resource to resource. AWS X-Ray can then generate a map for each request which shows how API Gateway, Lambda, S3, DynamoDb, and remote endpoints are connected.

In addition to enabling tracing, make sure you set `CACHE_DATA_AWS_X_RAY_ON: true` in your Lambda environment variables.

Lambda Insights provides additional metrics for your Lambda function and can be enabled just by including the Lambda Insights  Layer in your function definition.

Cache-data also provides:

- Logging methods including `Timer` and `DebugAndLog`.
- Automatic request response logging when using the `ClientRequest` and `Response` objects which can be used in CloudWatch Dashboards.

For information on using these Class objects see [Features](../features/tools/README.md).

## CloudFormation Template Example

Below is an example of various settings in a CloudFormation template demonstrating key elements used to enable X-Ray tracing, setting environment variables, including the Lambda Insights Layer, and providing your Lambda function execution privileges for using Lambda Insights and X-Ray.

A more complete example is provided in [example-template-lambda-function.yml](../00-example-implementation/example-template-lambda-function.yml).

An even more complete application starter template that implements cache-data as an API web service can be found in the [63Klabs GitHub repositories](https://github.com/63Klabs).

```yaml
# template.yml
Resources:

  # API Gateway

  WebApi:
    Type: AWS::Serverless::Api
    Properties: 
    # ...
      TracingEnabled: True

  # Lambda Function

  AppFunction:
    Type: AWS::Serverless::Function
    Properties:
      # ...
      Tracing: "Active"

      Layers:
        - !Sub "arn:aws:lambda:${AWS::Region}:${InsightsAccount}:layer:LambdaInsightsExtension:${Version}"

      Environment:
        Variables:
          # ...
          LOG_LEVEL: 5 # 0 for prod, 2-5 for non-prod
          CACHE_DATA_AWS_X_RAY_ON: true

  # LambdaFunction Execution Role

  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:

      # ...
      # These are for application monitoring via LambdaInsights and X-Ray
      ManagedPolicyArns:
        - 'arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy'
        - 'arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess'
```