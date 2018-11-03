import * as TOML from '@iarna/toml';
import { apps, core, rbac } from '@pulumi/kubernetes';
import { core as coreInputType, meta } from '@pulumi/kubernetes/types/input';
import { ComponentResource, ComponentResourceOptions, Output } from '@pulumi/pulumi';
import { getName } from '@pulumi-packs/gke-utils';
import * as hash from 'object-hash';

/**
 * This file contains the GitlabKubernetesRunner pulumi custom component.
 * It is originally based on the offical gitlab helm chart but was simplified quite a lot over time and one major difference is that this package configures gitlab runner
 * via the config.toml file instead of environment variables, which allows for greate customization options since some features (like interactive web terminals) can
 * only be configured via the config.toml
 */

// this port is taken from some gitlab example. We can set it to some other random port and it should still work.
const sessionServerPort = 8093;
const appName = 'gitlab-runner';

export interface GitlabKubernetesRunnerParams {
  /**
   * GitLab Runner Image ref: https://hub.docker.com/r/gitlab/gitlab-runner/tags/
   */
  coreImage: string;
  defaultBuildImage?: string;
  helperImage: string;
  concurrent: number;
  runnerToken: string;
  enableInteractiveWebTerminals?: boolean;
  env?: { [key: string]: string };
}

export class GitlabKubernetesRunner extends ComponentResource {
  constructor(name: string, params: GitlabKubernetesRunnerParams, resourceOptions: ComponentResourceOptions) {
    super(`gitlab:${GitlabKubernetesRunner.name}`, name, {}, resourceOptions);

    const runnerConfig = {
      concurrent: params.concurrent,
      check_interval: 3,
      log_level: 'info',
      runners: [
        // check this: https://gitlab.com/gitlab-org/gitlab-runner/blob/master/common/config.go for what values are possible
        {
          url: 'https://gitlab.com/',
          executor: 'kubernetes',
          token: params.runnerToken,
          environment: Object.entries(params.env).map(([name, value]) => `${name}=${value}`),
          kubernetes: {
            privileged: true,
            image: 'ubuntu:16.04',
            namespace: appName,
            cpu_request: '2000m',
            memory_request: '1800Mi',
            helper_image: params.helperImage
          }
        }
      ]
    };

    /* 
    This affinity spec specifies anti-Affinity to preemptible nodes. 
    It is not possible to express this with simple nodeSelectors, since non-preemptible nodes don't even have the gke-preemptible label key.
    For more info on how this works check: https://kubernetes.io/docs/concepts/configuration/assign-pod-node/#affinity-and-anti-affinity .
    */
    const dontScheduleOnPreemptibleNodesAntiAffinitySpec: coreInputType.v1.Affinity = {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [
            {
              matchExpressions: [
                {
                  key: 'cloud.google.com/gke-preemptible',
                  operator: 'NotIn',
                  values: ['true']
                }
              ]
            }
          ]
        }
      }
    };

    const commonLabels = {
      app: appName
    };

    const commonMetadata = {
      name: appName,
      namespace: appName,
      labels: commonLabels
    };

    const service =
      params.enableInteractiveWebTerminals &&
      new core.v1.Service(
        appName,
        {
          metadata: commonMetadata,
          spec: {
            type: 'LoadBalancer',
            selector: commonLabels,
            ports: [{ port: sessionServerPort }]
          }
        },
        {
          parent: this
        }
      );

    const configSecret = new core.v1.Secret(
      appName,
      {
        metadata: commonMetadata,
        type: 'Opaque',
        stringData: {
          'config.toml': params.enableInteractiveWebTerminals
            ? service.status.apply(status =>
                TOML.stringify({
                  session_server: {
                    session_timeout: 999,
                    advertise_address: status.loadBalancer.ingress[0].ip + ':' + sessionServerPort,
                    listen_address: `0.0.0.0:${sessionServerPort}`
                  },
                  ...runnerConfig
                })
              )
            : TOML.stringify(runnerConfig)
        }
      },
      { parent: this }
    );

    const serviceAccount = new core.v1.ServiceAccount(
      appName,
      {
        metadata: commonMetadata
      },
      { parent: this }
    );

    const deployment = new apps.v1.Deployment(
      appName,
      {
        metadata: commonMetadata,
        spec: {
          replicas: 1,
          selector: { matchLabels: commonLabels },
          template: {
            metadata: {
              ...commonMetadata,
              annotations: {
                'prometheus.io/scrape': 'true',
                'prometheus.io/port': '9252',
                // inject a hash of the runner config as annotation to ensure gitlab runner gets restarted whenever the config changes.
                'config-hash': hash(runnerConfig)
              }
            },
            spec: {
              // inject anti affinity into gitlab runner to avoid restarts (which it can't handle well) by preventing it from being scheduled onto preemptible nodes.
              affinity: dontScheduleOnPreemptibleNodesAntiAffinitySpec,
              securityContext: {
                runAsUser: 100,
                fsGroup: 65533
              },
              serviceAccountName: 'gitlab-runner',
              containers: [
                {
                  name: 'gitlab-runner',
                  image: params.coreImage,
                  imagePullPolicy: 'IfNotPresent',
                  command: ['/bin/bash', '-c'],
                  args: [
                    `/entrypoint run --user=gitlab-runner --working-directory=/home/gitlab-runner -c /config/config.toml`
                  ],
                  livenessProbe: {
                    exec: {
                      command: ['/usr/bin/pgrep', 'gitlab.*runner']
                    },
                    initialDelaySeconds: 60,
                    timeoutSeconds: 1,
                    periodSeconds: 10,
                    successThreshold: 1,
                    failureThreshold: 3
                  },
                  readinessProbe: {
                    exec: {
                      command: ['/usr/bin/pgrep', 'gitlab.*runner']
                    },
                    initialDelaySeconds: 10,
                    timeoutSeconds: 1,
                    periodSeconds: 10,
                    successThreshold: 1,
                    failureThreshold: 3
                  },
                  ports: [
                    {
                      name: 'metrics',
                      containerPort: 9252
                    }
                  ],
                  volumeMounts: [
                    {
                      name: 'config',
                      mountPath: '/config'
                    }
                  ],
                  resources: {
                    requests: {
                      cpu: '500m',
                      memory: '256Mi'
                    }
                  }
                }
              ],
              volumes: [
                {
                  name: 'config',
                  secret: {
                    secretName: getName(configSecret)
                  }
                }
              ]
            }
          }
        }
      },
      { parent: this }
    );

    const role = new rbac.v1.Role(
      appName,
      {
        metadata: commonMetadata,

        rules: [
          {
            apiGroups: [''],
            resources: ['*'],
            verbs: ['*']
          }
        ]
      },
      { parent: this }
    );

    const roleBinding = new rbac.v1.RoleBinding(
      appName,
      {
        metadata: commonMetadata,
        roleRef: {
          apiGroup: 'rbac.authorization.k8s.io',
          kind: 'Role',
          name: getName(role)
        },
        subjects: [
          {
            kind: 'ServiceAccount',
            name: getName(serviceAccount),
            namespace: 'gitlab-runner'
          }
        ]
      },
      {
        parent: this
      }
    );
  }
}
