import * as gcp from '@pulumi/gcp';
import * as k8s from '@pulumi/kubernetes';
import { createKubectlConfig } from '@pulumi-packs/gke-utils';
import { clusterName, namespace } from './common';
import * as pulumi from '@pulumi/pulumi';

const masterVersion = '1.10.7-gke.6';
const nodeVersion = '1.10.7-gke.6';
const primaryZone = 'us-west1-b';
const commonOauthScopes = [
  'https://www.googleapis.com/auth/compute',
  'https://www.googleapis.com/auth/devstorage.read_write',
  'https://www.googleapis.com/auth/logging.write',
  'https://www.googleapis.com/auth/monitoring',
  'https://www.googleapis.com/auth/servicecontrol',
  'https://www.googleapis.com/auth/service.management.readonly',
  'https://www.googleapis.com/auth/trace.append'
];

export const cluster = new gcp.container.Cluster(clusterName, {
  name: clusterName,
  zone: primaryZone,
  minMasterVersion: masterVersion,
  initialNodeCount: 1,
  removeDefaultNodePool: true,
  loggingService: 'logging.googleapis.com/kubernetes',
  monitoringService: 'monitoring.googleapis.com/kubernetes',
  ipAllocationPolicy: {
    createSubnetwork: true
  }
});

const defaultPoolName = 'default-pool';

/* 
  NOTE: the core gitlab-runner doesn't like being restarted as it will lose track of all jobs at the time of the restart and those jobs continue to use of resources and will never get killed (incl. some secrets belonging to them).
  In order to avoid the frequency of this problem we create small non-preemptible default pool which can be used by gitlab-runner.
*/
const defaultPool = new gcp.container.NodePool(defaultPoolName, {
  cluster: cluster.name,
  zone: primaryZone,
  version: nodeVersion,
  management: {
    autoRepair: true
  },
  nodeCount: 1,
  nodeConfig: {
    machineType: 'n1-highcpu-8',
    preemptible: false,
    oauthScopes: commonOauthScopes
  }
});

const scalePoolName = 'scale-pool';

const scalePool = new gcp.container.NodePool(scalePoolName, {
  cluster: cluster.name,
  zone: primaryZone,
  version: nodeVersion,
  management: {
    autoRepair: true
  },
  autoscaling: {
    minNodeCount: 0,
    maxNodeCount: 20
  },
  nodeConfig: {
    machineType: 'n1-highcpu-8',
    preemptible: true,
    oauthScopes: commonOauthScopes,
    diskType: 'pd-ssd'
  }
});

export const k8sProvider = new k8s.Provider(
  clusterName,
  {
    kubeconfig: pulumi.all([cluster.masterAuth, cluster.endpoint]).apply(([masterAuth, endpoint]) =>
      createKubectlConfig({
        clusterCaCertificate: masterAuth.clusterCaCertificate,
        endpoint
      })
    ),
    namespace
  },
  { dependsOn: [defaultPool, scalePool] }
);
