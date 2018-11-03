import * as k8s from '@pulumi/kubernetes';
import { k8sProvider } from './cluster';
import { namespace } from './common';

export default new k8s.core.v1.Namespace(
  namespace,
  {
    metadata: {
      name: namespace
    }
  },
  { provider: k8sProvider }
);
