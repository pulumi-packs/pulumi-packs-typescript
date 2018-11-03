### WARNING

This component is not yet ready for consumption. It still has to be turned into an actual component / pulumi component resource and proper library with exports etc..

### TODOs before publishing this to npm
- turn this into a real library / componentresource
- auto publish custom dockerfile for helper fix
- create and publish @pulumi-packs/gke-utils library which is used to dynamically create a k8s provider from gke cluster. (Start off from here: https://gist.github.com/geekflyer/b78adab2667d8526a1dd593bc5c844bf)

### Description

This pulumi program sets up a GKE cluster which is exclusively used for gitlab-runner.
There are a couple of reasons to create a seperate cluster for gitlab-runner, the main one being that in order to allow docker-in-docker builds
all build containers run in privileged mode, which gives them the ability to elevate privileges and potentially do some nasty stuff to other containers in the cluster.
In order to reduce that risk we run gitlab-runner on a cluster of its own.

The pulumi code was originally using the official gitlab-runner chart but in order to use some advanced features like interactive web terminals and set common
environment variables we had to abandon the helm chart and write a pulumi config from scratch (that at least takes inspiration from https://gitlab.com/charts/gitlab-runner). 
The main difference is that the gitlab runner chart uses environment variables to configure the runner, whereas the new pulumi based setup configures the runner almost purely via the `config.toml`. The reason for that is that some advanced features can only be configured via the `config.toml` and not via environment variables (i.e. web terminals).
