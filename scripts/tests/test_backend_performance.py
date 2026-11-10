"""Measurement math must not silently mislabel maximums as p95."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('backend_performance', pathlib.Path(__file__).parents[1] / 'audit/backend_performance.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Percentiles(unittest.TestCase):
    def test_nearest_rank_p95_and_median_preserve_raw_order(self):
        samples = list(range(20, 0, -1))
        result = module.summarize(samples)
        self.assertEqual(result['p50_ms'], 10.5)
        self.assertEqual(result['p95_ms'], 19)
        self.assertEqual(result['max_ms'], 20)
        self.assertEqual(result['samples_ms'], list(range(20, 0, -1)))

    def test_single_and_empty_samples(self):
        self.assertEqual(module.summarize([4])['p95_ms'], 4)
        with self.assertRaises(ValueError):
            module.summarize([])
