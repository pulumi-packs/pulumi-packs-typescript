
# This builds a custom dockerfile for gitlab-runner-helper
# Why is this necessary?
# The standard gitlab-runner-helper is responsible for cloning and preparing contents of the repo to test.
# For some st**** reason the standard gitlab-runner-helper modifies the file permissions of the cloned repo and makes them "world-readable".
# This causes a variety of problems. For us it concretely causes docker images built in gitlab ci to have files with different permissions than when built outside gitlab CI (e.g. locally or another CI system). 
# So basically docker images built in gitlab end up being "different" than images built locally. 
# This causes another variety of problems, but one concrete one is that local vs gitlab-built images cannot be used interchangebly as --cache-from source because all COPY layers get a different checksum.
# In other words the first COPY statement in a dockerfile would invalidate all subsequent cached layers which leads to noticably longer build times locally and remotely. 
# This Dockerfile is an attempt to solve this problem. It builds a custom gitlab-runner-helper image which has this nasty `umask 0000` statement which changes file permissions removed.
# The built image is then used in our gitlab-runner-cluster (infrastructure-live repo) as override for the helper image in the helm chart.
# This workaround is inspired by https://gitlab.com/gitlab-org/gitlab-runner/issues/1736#note_52040299 .
# The FROM image below is suffixed with the SHORT GIT SHA1 of the corresponding gitlab runner version tag (check here https://gitlab.com/gitlab-org/gitlab-runner/tags).
# Currently this uses the SHA1 of gitlab runner 11.3.1.

FROM gitlab/gitlab-runner-helper:x86_64-0aa5179e
# this removes the umask manipulation line from the gitlab-runner-build bash script
RUN sed -i '/umask 0000/d' /usr/bin/gitlab-runner-build
