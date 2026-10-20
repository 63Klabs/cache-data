# Remove Node 20 Support

v1.3.17 implemented a deprecation notice for Node 20 and set some standards for removing support and updating documentation and steering documents for changeovers of this type.

Updating example documentation for template Lambda Node Runtimes to `nodejs26.x` or requiring 26 is out of scope as it is not yet generally available for production use on AWS Lambda. 

v1.3.17 should have fully ensured 26 is compatible with code existing code, so we do not need to implement 26.

Please generate a plan to move forward.