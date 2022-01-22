# dorky
DevOps Records Keeper


## Steps to use:

### To push files to S3 bucket.
1. Create a folder named `dorky` in S3.
2. Initialize dorky setup in the root folder of your project, using `dorky init`.
3. List the files using `dorky list`, (make sure to add excluded file or folder patterns to .dorkyignore, to minimize the list).
3. Add files to stage-1 using `dorky add file-name`.
4. Push files to S3 bucket using `dorky push`.

### To pull files from S3 bucket.
