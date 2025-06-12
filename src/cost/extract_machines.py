"""
Vibed code to build the pool_to_machine_type.json, including GPU cost information
"""

import re
import yaml
import json
import requests
from pathlib import Path

# Load cost tables
cost_path = Path("cpu_costs.json")
gpu_cost_path = Path("gpu_costs.json")

with cost_path.open() as f:
    machine_costs = json.load(f)
with gpu_cost_path.open() as f:
    gpu_costs = json.load(f)

# Download the YAML
# https://github.com/mozilla-releng/fxci-config/blob/main/worker-pools.yml
url = "https://raw.githubusercontent.com/mozilla-releng/fxci-config/refs/heads/main/worker-pools.yml"
resp = requests.get(url)
resp.raise_for_status()

data = yaml.safe_load(resp.text)

pool_mappings = {}


def extract_instance_configs(instances):
    if isinstance(instances, list):
        return instances
    elif isinstance(instances, dict):
        result = []
        for group in instances.values():
            result.extend(extract_instance_configs(group))
        return result
    return []


# Update pricing here:
# https://cloud.google.com/compute/vm-instance-pricing?hl=en#custommachinetypepricing
def price_custom_machine(machine_type):
    match = re.fullmatch(r"n1-custom-(\d+)-(\d+)", machine_type)
    if not match:
        return None

    vcpus = int(match.group(1))
    mem_mib = int(match.group(2))
    mem_gib = mem_mib / 1024

    cpu_price = 0.03319155  # per vCPU per hour
    mem_price = 0.004446  # per GiB RAM per hour

    total = round(vcpus * cpu_price + mem_gib * mem_price, 6)
    return {"vcpus": vcpus, "memory_gb": mem_gib, "usd_per_hour": total}


def extract_gpu_info(instance_type):
    accels = instance_type.get("guestAccelerators", [])
    if not accels:
        return None

    for accel in accels:
        acc_type = accel.get("acceleratorType")
        acc_count = accel.get("acceleratorCount", 0)
        if not acc_type or acc_count == 0:
            continue

        # Normalize to match keys in gpu_costs
        norm_type = acc_type.lower().replace("nvidia-tesla-", "nvidia-")
        gpu_price = gpu_costs.get(norm_type)

        return {
            "gpu_type": norm_type,
            "gpu_count": acc_count,
            "gpu_cost_per_hour": gpu_price,
            "total_gpu_cost": gpu_price * acc_count if gpu_price is not None else None,
        }

    return None


def add_pool(pool_key, machine_type, gpu_info=None):
    entry = {"machine_type": machine_type}
    cost_data = machine_costs.get(machine_type) or price_custom_machine(machine_type)
    if cost_data:
        entry.update(cost_data)

    if gpu_info:
        entry["gpu_type"] = gpu_info["gpu_type"]
        entry["gpu_count"] = gpu_info["gpu_count"]
        entry["gpu_cost_per_hour"] = gpu_info["gpu_cost_per_hour"]
        entry["total_gpu_cost"] = gpu_info["total_gpu_cost"]
        if (
            entry.get("usd_per_hour") is not None
            and gpu_info["total_gpu_cost"] is not None
        ):
            entry["usd_per_hour"] = round(
                entry["usd_per_hour"] + gpu_info["total_gpu_cost"], 6
            )
        else:
            entry["usd_per_hour"] = None

    pool_mappings[pool_key] = entry


for pool in data["pools"]:
    pool_id_template = pool["pool_id"]
    instance_configs = extract_instance_configs(
        pool.get("config", {}).get("instance_types", [])
    )

    def resolve_id(variant_dict=None, attributes_dict=None):
        resolved = pool_id_template
        if variant_dict:
            for key, value in variant_dict.items():
                resolved = resolved.replace(f"{{{key}}}", str(value))
        if attributes_dict:
            for key, value in attributes_dict.items():
                resolved = resolved.replace(f"{{{key}}}", str(value))
        return resolved.split("/")[-1]

    if "variants" in pool:
        for variant in pool["variants"]:
            pool_key = resolve_id(variant_dict=variant)
            for instance_type in instance_configs:
                machine_type = instance_type.get("machine_type")
                if machine_type:
                    gpu_info = extract_gpu_info(instance_type)
                    add_pool(pool_key, machine_type, gpu_info)
    elif "attributes" in pool and "suffix" in pool["attributes"]:
        pool_key = resolve_id(attributes_dict=pool["attributes"])
        for instance_type in instance_configs:
            machine_type = instance_type.get("machine_type")
            if machine_type:
                gpu_info = extract_gpu_info(instance_type)
                add_pool(pool_key, machine_type, gpu_info)
    else:
        pool_key = resolve_id()
        for instance_type in instance_configs:
            machine_type = instance_type.get("machine_type")
            if machine_type:
                gpu_info = extract_gpu_info(instance_type)
                add_pool(pool_key, machine_type, gpu_info)

# Save result
output_path = Path("machine_pricing.json")
output_path.write_text(json.dumps(pool_mappings, indent=2))
print(f"Saved mapping to {output_path}")
