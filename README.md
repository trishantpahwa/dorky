# dorky
DevOps Records Keeper

## Steps to use:

> Setup AWS_ACCESS_KEY and AWS_SECRET_KEY before hand.

### To push files to S3 bucket.
1. Create a folder named `dorky` in S3.
2. Initialize dorky setup in the root folder of your project, using `dorky init`.
3. List the files using `dorky list`, (make sure to add excluded file or folder patterns to .dorkyignore, to minimize the list).
3. Add files to stage-1 using `dorky add file-name`.
4. Push files to S3 bucket using `dorky push`.

### To pull files from S3 bucket.
1. Initialize dorky project using `dorky init`.
2. Use `dorky pull` to pull the status from S3 bucket.
3. Use `dorky pull-files` to pull the files from S3 bucket.