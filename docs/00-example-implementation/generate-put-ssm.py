#!/usr/bin/env python3

# From npm @63klabs/cache-data
# This script is used to create a secure SSM Parameter in AWS Parameter Store.
# Cache-Data requires a secure key to be stored in SSM Parameter Store.
# This script can be used to generate random keys or use provided values.
# Include this script in your CI/CD pipeline to automate the process of creating secure parameters.
# It reads tags from a template-configuration.json file, which is common for SAM deployments,
# and applies them to the parameter.

import sys
import secrets
import boto3
from botocore.exceptions import ClientError
import json
import os
import argparse
import re

def usage():
    print(f"""Creates a secure SSM Parameter in AWS Parameter Store.
    This script can generate a random key of specified bit length or use a provided value.
    It also reads tags from a template-configuration.json file (common for SAM deployments)
    and applies them to the parameter.

    NOTE:
        It is designed to be used in a CI/CD pipeline, such as AWS CodePipeline.
        It requires the AWS SDK for Python (boto3) and the botocore library.
        Ensure CodeBuild has the necessary permissions to create and manage SSM parameters.
        It can be run manually from a local CLI with a specific AWS profile if needed.
        There is a --dryrun option to check if the parameter exists (and see values and tags) without creating it for testing purposes.
        IT WILL NOT OVERWRITE AN EXISTING PARAMETER! DELETE IT FIRST IF YOU WANT TO REPLACE IT,
            or, update using the AWS CLI, or manually through the console.

    Usage: {sys.argv[0]} <PARAM_NAME> [--generate BITS | --value VALUE] [--dryrun] [--profile PROFILE]
        PARAM_NAME
            The name of the key parameter
            For example, '/webservices/myapp/CacheData_SecureDataKey'
        --generate BITS
            Generate a random key with specified number of bits (mutually exclusive with --value)
        --value VALUE
            Use the provided value directly (mutually exclusive with --generate)
        --dryrun
            Check if parameter exists but don't create it
        --profile PROFILE
            AWS profile to use for the request""", file=sys.stderr)

def generate_key(key_len):
    """Generate a random hex key of specified bit length"""
    return secrets.token_hex(key_len // 8)  # key_len bits ÷ 8 bits/byte = bytes needed

def put_parameter(ssm_client, param_full_name, value, tags, dryrun=False):
    """Store a parameter in SSM Parameter Store"""
    print(f"Checking for SSM Parameter: {param_full_name} ...")
    
    try:
        ssm_client.get_parameter(Name=param_full_name)
        print("Parameter already exists. Skipping.")
    except ClientError as e:
        if e.response['Error']['Code'] == 'ParameterNotFound':
            print("...parameter does not exist...")
            if dryrun:
                print(f"[DRYRUN] Would store parameter: {param_full_name}")
            else:
                print(f"Storing parameter: {param_full_name} ...")
                ssm_client.put_parameter(
                    Name=param_full_name,
                    Value=value,
                    Type='SecureString',
                    Tags=tags,
                    Overwrite=False
                )
        else:
            raise

def get_tags():

    tags = []

    # read in template-configuration.json from current directory or parent directory
    config_file = None
    if os.path.exists('template-configuration.json'):
        config_file = 'template-configuration.json'
    elif os.path.exists('../template-configuration.json'):
        config_file = '../template-configuration.json'
    
    try:
        if config_file:
            with open(config_file, 'r') as f:
                config = json.load(f)

                # Find the Tags property in config
                # {
                #   "Tags": {
                #     "Provisioner": "CloudFormation",
                #     "Environment": "$DEPLOY_ENVIRONMENT$",
                #     "Deploy": "$PREFIX$ - $DEPLOY_ENVIRONMENT$",
                #     "Stage": "$STAGE_ID$"
                #     }
                # }
                # perform a search and replace of config utilizing environment variables,
                # for example: replace $PREFIX$ with the value of the PREFIX environment variable
                # Replacements may come anywhere in the value of the tag, not just at the beginning or end.
                # set tags to the value of the tags property in config
                if 'Tags' in config:
                    config_tags = config['Tags']
                    for key, value in config_tags.items():
                        # Find all instances of variable placeholders in the value
                        # Place holders are in the format $VARIABLE_NAME$
                        # Replace them with the corresponding environment variable values
                        if isinstance(value, str):
                            # Find variable placeholders in the format $VARIABLE_NAME$
                            placeholders = re.findall(r'\$([A-Z_][A-Z0-9_]*)\$', value)
                            for placeholder in placeholders:
                                # Check if the placeholder corresponds to an environment variable
                                env_value = os.getenv(placeholder)
                                if env_value is not None:
                                    # Replace the placeholder with the environment variable value
                                    value = value.replace(f"${placeholder}$", env_value)
                                else:
                                    print(f"Environment variable '{placeholder}' not found. Using original value.", file=sys.stderr)
                        # Append the tag to the tags list
                        tags.append({'Key': key, 'Value': value})
                else:
                    print("No Tags found in template-configuration.json. Using default tags.", file=sys.stderr)

        else:
            raise FileNotFoundError("template-configuration.json not found in current or parent directory")

    except FileNotFoundError:
        print("template-configuration.json not found in current or parent directory. Using default tags.", file=sys.stderr)
    except json.JSONDecodeError:
        print("Error decoding JSON from template-configuration.json. Using default tags.", file=sys.stderr)
    except Exception as e:
        print(f"Error reading template-configuration.json: {e}", file=sys.stderr)

    # Find the element in the tags list that has the key 'Provisioner' and replace its value with 'CodeBuild'
    provisioner_tag = next((tag for tag in tags if tag['Key'] == 'Provisioner'), None)
    if provisioner_tag:
        provisioner_tag['Value'] = 'CodeBuild'
    else:
        tags.append({'Key': 'Provisioner', 'Value': 'CodeBuild'})

    # Find the element in the tags list that has the key 'DeployedUsing' and replace its value with 'CodeBuild'
    deployed_using_tag = next((tag for tag in tags if tag['Key'] == 'DeployedUsing'), None)
    if deployed_using_tag:
        deployed_using_tag['Value'] = 'Build Script'
    else:
        tags.append({'Key': 'DeployedUsing', 'Value': f'Build Script {sys.argv[0]}'})

    # print out the tags
    print("Tags to be used:")
    for tag in tags:
        print(f"  {tag['Key']}: {tag['Value']}")

    return tags

def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('param_name', help='The name of the key parameter')
    parser.add_argument('--generate', type=int, help='Generate a random key with specified number of bits')
    parser.add_argument('--value', type=str, help='Use the provided value directly')
    parser.add_argument('--dryrun', action='store_true', help='Check if parameter exists but don\'t create it')
    parser.add_argument('--profile', type=str, help='AWS profile to use for the request')
    
    try:
        args = parser.parse_args()
    except:
        usage()
        sys.exit(1)
    
    # Check for mutually exclusive options
    if args.generate is not None and args.value is not None:
        print("Error: --generate and --value cannot be used together", file=sys.stderr)
        sys.exit(1)
    
    param_name = args.param_name
    if not param_name.startswith('/'):
        print("Error: PARAM_NAME must start with a '/'", file=sys.stderr)
        sys.exit(1)

    print(f"Parameter Name: {param_name}")

    # Determine value to store
    if args.value is not None:
        value = args.value
        print(f"Using provided value: {value}")
    elif args.generate is not None:
        value = generate_key(args.generate)
        if (args.dryrun):
            print(f"[DRYRUN] Generated key of bit length {args.generate}: {value}")
        else:
            print(f"Generated key of bit length {args.generate}")
    else:
        value = "BLANK"
        print("No value provided. Using default value: 'BLANK' which needs to be replaced with a real value.")
    
    tags = get_tags()

    try:
        session = boto3.Session(profile_name=args.profile) if args.profile else boto3.Session()
        ssm_client = session.client('ssm')
        put_parameter(ssm_client, f"{param_name}", value, tags, args.dryrun)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()