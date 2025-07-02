> Note: To implement Cache Data, a DynamoDb and S3 bucket needs to be created to store the cache.

## Cache-Data DynamoDb and S3 CloudFormation Resource Templates

Use the [S3 and DynamoDb example template](./example-template-s3-and-dynamodb-cache-store.yml) for creating your DynamoDb and S3 cache storage locations.

You can create a centrally-shared DynamoDb table and S3 location for use among all your instances (each instance has its own encryption key to prevent cache-sharing/exposure).

You can also add the DynamoDbTable and CacheDataS3Bucket to each application template individually. However, this will quickly increase the number of S3 buckets and DynamoDb tables to keep track of.

