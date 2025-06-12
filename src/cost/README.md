# Cost estimator

This doesn't necessarily represent the cost to Mozilla for training a language model, but
it can show the relative costs for tasks to know what to optimize.

Useful links:

* [Looker for translations tasks](https://mozilla.cloud.looker.com/x/DkWBHCwCzuhqK0Y8vb5gdH)
* [Public VM instance pricing](https://cloud.google.com/compute/vm-instance-pricing?hl=en)
* [Public GPU pricing](https://cloud.google.com/compute/gpus-pricing?hl=en)


## Re-fetch prices:

Run in DevTools:
 * src/cost/extract_cpu_costs.js
 * src/cost/extract_gpu_costs.js

Re-fetch the `worker-pools.yml`

```sh
cd src/cost
python src/cost/extract_machines.py
```

Update custom machine pricing:

* https://cloud.google.com/compute/vm-instance-pricing?hl=en#custommachinetypepricing
* Update values for `price_custom_machine` in `src/cost/extract_machines.py`.
