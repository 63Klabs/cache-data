# Fully Implement SSM Parameter Store and Secrets Manager SDK

Currently there are two methods to load SSM Parameters and Secrets from Secrets Manager into Lambda functions using @63klabs/cache-data:

- Lambda Layer: AWS-Parameters-and-Secrets-Lambda-Extension
- AppConfig SSM Parameters: AppConfig.init(options.ssmParameters) and defined in tools/index.js

The Lambda Layer is fully implemented through tools.CachedParametersSecrets.classes.js. 

While the lambda layer is robust and has worked well, and should be available, it is a layer that requires frequent template updates to ensure we are using the latest version. For some engineers it would be nice to reduce the number of dependencies and not use the layer if SSM Parameters SDK is preferred.

Glossary:

- Config SSM Parameter Implementation: Set through AppConfig.init(options.ssmParameters) and defined in tools/index.js
- Lambda Layer Implementation: Uses the AWS provided Lambda layer: AWS-Parameters-and-Secrets-Lambda-Extension

We need to:

- Extend functionality of this class to fall back on handling it's own retreival using the SDK if the lambda layer is not being used.
- Detect if the lambda layer is available, if not, fall back and handle own retreival
- Continue full support of both existing Config SSM Parameter and Layer implementation.
- Add Secrets Manager support to the Config SSM Parameter implementation.
- The lambda layer implementation should continue to support the current method of individually defining the parameters using the classes `CachedSsmParameter` and `CachedSecret` but also support the method by which Config SSM Parameter Implementation consumes the parameters to load (using path and specific names)
- Like validations for ClientRequest.init and connections for Connections, there should be a CachedParameterSecrets.init() that consumes a list of parameter and secret paths and individual names.
- To implement Secrets manager, we may need to extend the use of the AWS SDK to include required functions alongside SSM in the AWS class.

Ask clarifying questions in SPEC-QUESTIONS.md in this directory and the user will respond with answers there.

```yaml
  AppFunction:
    Type: AWS::Serverless::Function
    Properties:
      # ...
      Runtime: nodejs24.x
      MemorySize: 1028
      Role: !GetAtt LambdaExecutionRole.Arn

      # Lambda Insights and X-Ray
      Tracing: "Active" # X-Ray

      Layers:
        # Lambda Insights and Param Secrets - Account and Version are Mapped in as they vary by region and architecture
        - !Sub "arn:aws:lambda:${AWS::Region}:${AWSParamAccount}:layer:AWS-Parameters-and-Secrets-Lambda-Extension:${Version}"
```