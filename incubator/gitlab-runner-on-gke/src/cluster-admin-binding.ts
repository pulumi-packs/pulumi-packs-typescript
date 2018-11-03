import * as k8s from '@pulumi/kubernetes';
import { k8sProvider } from './cluster';

const clusterAdmins = ['<EMAIL_OF_THE_USER_WHICH_RUNS_PULUMI>'];

export default new k8s.rbac.v1.ClusterRoleBinding(
  'cluster-admin-binding',
  {
    metadata: {
      name: 'cluster-admin-binding'
    },
    roleRef: {
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'ClusterRole',
      name: 'cluster-admin'
    },
    subjects: clusterAdmins.map(email => ({
      apiGroup: 'rbac.authorization.k8s.io',
      kind: 'User',
      name: email
    }))
  },
  { provider: k8sProvider }
);
