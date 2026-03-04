---
inclusion: fileMatch
fileMatchPattern: '**/{template,cfn}*.{yml,yaml}'
---

# Naming Conventions - CloudFormation/SAM Templates

## Purpose

This document defines naming conventions specific to CloudFormation and SAM template development. These conventions apply when working with CloudFormation template files (typically prefixed with `template` or `cfn`).

---

## Template Parameters

Use **PascalCase** for all parameter names:

```yaml
Parameters:
  EnvironmentName:
    Type: String
    Description: Environment name (dev, staging, prod)
    AllowedValues:
      - dev
      - staging
      - prod
  
  DatabaseInstanceType:
    Type: String
    Description: RDS instance type
    Default: db.t3.micro
  
  EnableAutoScaling:
    Type: String
    AllowedValues: [true, false]
    Default: false
    Description: Enable auto scaling
  
  MaxInstanceCount:
    Type: Number
    Description: Maximum number of instances
    Default: 10
    MinValue: 1
    MaxValue: 100
  
  VpcCIDR:
    Type: String
    Description: VPC CIDR block
    Default: 10.0.0.0/16
  
  S3BucketName:
    Type: String
    Description: S3 bucket name for artifacts
```

### Atlantis Platform Naming Convention

For applications using the Atlantis platform, parameters must follow this pattern:

```yaml
Parameters:
  Prefix:
    Type: String
    Description: Team or organization identifier
    Default: acme
  
  ProjectId:
    Type: String
    Description: Short identifier for the application
    Default: person-api
  
  StageId:
    Type: String
    Description: Deployment stage
    AllowedValues:
      - test
      - beta
      - stage
      - prod
```

---

## Resource Logical IDs (Reference Names)

Use **PascalCase** for resource logical IDs:

```yaml
Resources:
  UserTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${EnvironmentName}-users
  
  CacheBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub ${EnvironmentName}-cache-bucket
  
  APIGatewayRestAPI:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: !Sub ${EnvironmentName}-api
  
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub ${EnvironmentName}-lambda-execution-role
  
  ApplicationLoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: !Sub ${EnvironmentName}-alb
  
  GetUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ${Prefix}-${ProjectId}-${StageId}-GetUser
```

---

## Actual Resource Names (Properties)

Use **kebab-case** with environment/stage prefixes for actual AWS resource names:

```yaml
Resources:
  UserTable:
    Type: AWS::DynamoDB::Table
    Properties:
      # Actual resource name: kebab-case with environment prefix
      TableName: !Sub ${EnvironmentName}-users-table
  
  CacheBucket:
    Type: AWS::S3::Bucket
    Properties:
      # Actual bucket name: kebab-case with environment prefix
      BucketName: !Sub ${EnvironmentName}-cache-bucket
  
  ProcessingFunction:
    Type: AWS::Lambda::Function
    Properties:
      # Actual function name: kebab-case with environment prefix
      FunctionName: !Sub ${EnvironmentName}-data-processor
```

### Atlantis Platform Resource Naming

For Atlantis platform applications, use the `Prefix-ProjectId-StageId` pattern:

```yaml
Resources:
  GetPersonFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ${Prefix}-${ProjectId}-${StageId}-GetPerson
      Handler: index.handler
      Runtime: nodejs20.x
  
  PersonTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${Prefix}-${ProjectId}-${StageId}-Person
  
  PersonQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub ${Prefix}-${ProjectId}-${StageId}-PersonQueue
  
  PersonTopic:
    Type: AWS::SNS::Topic
    Properties:
      TopicName: !Sub ${Prefix}-${ProjectId}-${StageId}-PersonTopic
```

---

## Condition Names

Use **PascalCase** for condition names:

```yaml
Conditions:
  IsProduction: !Equals [!Ref EnvironmentName, prod]
  
  IsProdEnvironment: !Equals [!Ref StageId, prod]
  
  EnableAutoScaling: !Equals [!Ref EnableAutoScaling, true]
  
  CreateDatabaseReplica: !And
    - !Condition IsProduction
    - !Equals [!Ref EnableHighAvailability, true]
  
  UseCustomDomain: !Not [!Equals [!Ref DomainName, ""]]
  
  IsTestEnvironment: !Equals [!Ref StageId, test]
```

---

## Mapping Names

Use **PascalCase** for mapping names:

```yaml
Mappings:
  EnvironmentConfig:
    dev:
      InstanceType: t3.micro
      MinSize: 1
      MaxSize: 2
    staging:
      InstanceType: t3.small
      MinSize: 2
      MaxSize: 5
    prod:
      InstanceType: t3.large
      MinSize: 3
      MaxSize: 10
  
  RegionConfig:
    us-east-1:
      AMI: ami-12345678
      AvailabilityZones: [us-east-1a, us-east-1b]
    us-west-2:
      AMI: ami-87654321
      AvailabilityZones: [us-west-2a, us-west-2b]
  
  StageConfig:
    test:
      LogRetention: 7
      EnableAlarms: false
    prod:
      LogRetention: 90
      EnableAlarms: true
```

---

## Output Names

Use **PascalCase** for output names:

```yaml
Outputs:
  UserTableName:
    Description: DynamoDB table name for users
    Value: !Ref UserTable
    Export:
      Name: !Sub ${AWS::StackName}-UserTableName
  
  APIEndpoint:
    Description: API Gateway endpoint URL
    Value: !Sub https://${APIGatewayRestAPI}.execute-api.${AWS::Region}.amazonaws.com
  
  LoadBalancerDNS:
    Description: Application Load Balancer DNS name
    Value: !GetAtt ApplicationLoadBalancer.DNSName
  
  GetPersonFunctionArn:
    Description: ARN of GetPerson Lambda function
    Value: !GetAtt GetPersonFunction.Arn
    Export:
      Name: !Sub ${AWS::StackName}-GetPersonFunctionArn
```

---

## Environment Variables (in Lambda Functions)

Use **UPPER_SNAKE_CASE** for environment variable names:

```yaml
Resources:
  ProcessingFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ${Prefix}-${ProjectId}-${StageId}-DataProcessor
      Environment:
        Variables:
          TABLE_NAME: !Ref UserTable
          BUCKET_NAME: !Ref CacheBucket
          REGION: !Ref AWS::Region
          LOG_LEVEL: info
          MAX_RETRY_COUNT: 3
          API_BASE_URL: https://api.example.com
          ENABLE_CACHING: true
```

---

## IAM Role and Policy Names

### Role Names

Use **PascalCase** for logical IDs, descriptive names for actual role names:

```yaml
Resources:
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub ${Prefix}-${ProjectId}-${StageId}-LambdaExecution
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
  
  CodeBuildServiceRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub ${Prefix}-${ProjectId}-${StageId}-CodeBuildService
```

### Policy Names

Use **PascalCase** for logical IDs:

```yaml
Resources:
  LambdaExecutionPolicy:
    Type: AWS::IAM::Policy
    Properties:
      PolicyName: !Sub ${Prefix}-${ProjectId}-${StageId}-LambdaExecutionPolicy
      Roles:
        - !Ref LambdaExecutionRole
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Action:
              - s3:GetObject
              - s3:PutObject
            Resource:
              - !Sub arn:aws:s3:::${Prefix}-${ProjectId}-${StageId}-data/*
```

---

## AWS Resource Tagging

### Standard Tags

All AWS resources should include these standard tags:

```yaml
Resources:
  UserTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${Prefix}-${ProjectId}-${StageId}-User
      Tags:
        - Key: Environment
          Value: !Ref StageId
        - Key: Project
          Value: !Ref ProjectId
        - Key: ManagedBy
          Value: CloudFormation
        - Key: CostCenter
          Value: Engineering
        - Key: Owner
          Value: platform-team
```

### Service-Specific Tags

Use **serviceName:TagName** format for service-specific tags:

**Format**: `serviceName:TagName` where:
- First word of service name is lowercase
- Subsequent words are capitalized
- Tag name is PascalCase

```yaml
Tags:
  # Cache invalidation service
  - Key: cacheInvalidator:AllowAccess
    Value: true
  
  - Key: cacheInvalidator:Priority
    Value: high
  
  # API Gateway service
  - Key: apiGateway:RateLimit
    Value: 1000
  
  - Key: apiGateway:EnableCaching
    Value: true
  
  # Lambda function service
  - Key: lambdaFunction:Timeout
    Value: 300
  
  - Key: lambdaFunction:MemorySize
    Value: 1024
  
  # Database service
  - Key: database:BackupRetention
    Value: 7
  
  - Key: database:EnableEncryption
    Value: true
```

---

## Complete Template Example

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Person API - Serverless application for managing person data

Parameters:
  Prefix:
    Type: String
    Description: Team or organization identifier
    Default: acme
  
  ProjectId:
    Type: String
    Description: Short identifier for the application
    Default: person-api
  
  StageId:
    Type: String
    Description: Deployment stage
    AllowedValues:
      - test
      - beta
      - stage
      - prod
  
  LogRetentionDays:
    Type: Number
    Description: CloudWatch Logs retention in days
    Default: 7

Conditions:
  IsProduction: !Equals [!Ref StageId, prod]
  IsTestEnvironment: !Equals [!Ref StageId, test]

Mappings:
  StageConfig:
    test:
      MemorySize: 512
      Timeout: 30
    prod:
      MemorySize: 1024
      Timeout: 60

Resources:
  # DynamoDB Table
  PersonTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub ${Prefix}-${ProjectId}-${StageId}-Person
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
      KeySchema:
        - AttributeName: id
          KeyType: HASH
      Tags:
        - Key: Environment
          Value: !Ref StageId
        - Key: Project
          Value: !Ref ProjectId
        - Key: ManagedBy
          Value: CloudFormation
  
  # Lambda Execution Role
  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub ${Prefix}-${ProjectId}-${StageId}-LambdaExecution
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: DynamoDBAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                  - dynamodb:UpdateItem
                  - dynamodb:DeleteItem
                  - dynamodb:Query
                  - dynamodb:Scan
                Resource:
                  - !GetAtt PersonTable.Arn
  
  # Lambda Function
  GetPersonFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub ${Prefix}-${ProjectId}-${StageId}-GetPerson
      Handler: index.handler
      Runtime: nodejs20.x
      MemorySize: !FindInMap [StageConfig, !Ref StageId, MemorySize]
      Timeout: !FindInMap [StageConfig, !Ref StageId, Timeout]
      Role: !GetAtt LambdaExecutionRole.Arn
      Environment:
        Variables:
          TABLE_NAME: !Ref PersonTable
          STAGE_ID: !Ref StageId
          LOG_LEVEL: !If [IsTestEnvironment, debug, info]
      Tags:
        Environment: !Ref StageId
        Project: !Ref ProjectId
  
  # CloudWatch Log Group
  GetPersonFunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub /aws/lambda/${GetPersonFunction}
      RetentionInDays: !Ref LogRetentionDays

Outputs:
  PersonTableName:
    Description: DynamoDB table name for persons
    Value: !Ref PersonTable
    Export:
      Name: !Sub ${AWS::StackName}-PersonTableName
  
  GetPersonFunctionArn:
    Description: ARN of GetPerson Lambda function
    Value: !GetAtt GetPersonFunction.Arn
    Export:
      Name: !Sub ${AWS::StackName}-GetPersonFunctionArn
  
  LambdaExecutionRoleArn:
    Description: ARN of Lambda execution role
    Value: !GetAtt LambdaExecutionRole.Arn
```

---

## Summary

**CloudFormation/SAM Naming Quick Reference:**

- Parameters: `PascalCase`
- Resources (Logical ID): `PascalCase`
- Resources (Actual Name): `kebab-case` with `Prefix-ProjectId-StageId` pattern
- Conditions: `PascalCase`
- Mappings: `PascalCase`
- Outputs: `PascalCase`
- Environment Variables: `UPPER_SNAKE_CASE`
- IAM Roles: `PascalCase` (logical), `Prefix-ProjectId-StageId-RoleName` (actual)
- Tags (Standard): `PascalCase` keys
- Tags (Service-specific): `serviceName:TagName` format
- Atlantis Platform: Always use `Prefix-ProjectId-StageId` pattern for resource names
