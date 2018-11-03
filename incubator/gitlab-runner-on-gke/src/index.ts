import clusterAdminBinding from './cluster-admin-binding';
import { GitlabKubernetesRunner } from './gitlab-kubernetes-runner';
import namespaceResource from './namespace-resource';
import { Config } from '@pulumi/pulumi';
import { k8sProvider } from './cluster';

const config = new Config();

new GitlabKubernetesRunner(
  'gitlab-runner',
  {
    concurrent: 50,
    /* 
      you have to get this token manually for each runner installation by initiating a runner registration process using :
      `curl --request POST "https://gitlab.com/api/v4/runners" --form "token=<runner-registration-token>" --form "description=my-gitlab-runner"`
    */
    runnerToken: config.require('runner-token'),

    // TODO: use the custom helper image built from this repo
    helperImage: 'pulumi-packs/gitlab-runner-helper-umask-fix:v11.3.1',
    coreImage: 'gitlab/gitlab-runner:alpine-v11.3.1',
    // set those 2 environment variables for all builds, since they're pretty much required everywhere. This means we don't need to add them to the gitlab-ci.yml anymore.
    env: {
      DOCKER_HOST: 'tcp://localhost:2375',
      DOCKER_DRIVER: 'overlay2'
    },
    /*
     NOTE: Check https://gitlab.com/gitlab-org/gitlab-ce/issues/50144#note_108507078 for how interactive web terminals are secured.
    */
    enableInteractiveWebTerminals: false
  },
  {
    dependsOn: [namespaceResource, clusterAdminBinding],
    providers: { kubernetes: k8sProvider }
  }
);
