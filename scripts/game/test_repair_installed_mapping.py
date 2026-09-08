"""Regression checks for native helper descriptors that previously shifted fields."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("repair", Path(__file__).with_name("repair-installed-mapping.py"))
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class NativePropertyTests(unittest.TestCase):
    def test_map_with_enum_key_does_not_consume_next_field(self):
        rows = [{"name": name, "flag": flag} for name, flag in [
            ("Before", 10), ("MapValue", 3), ("UnderlyingType", 5),
            ("MapKey", 30), ("Map", 23), ("After", 76)]]
        roots = repair.property_roots(rows)
        self.assertEqual([row["name"] for row in roots], ["Before", "Map", "After"])
        self.assertEqual(roots[1]["children"][1]["children"][0]["name"], "UnderlyingType")

    def test_nested_array_helpers_are_not_fields(self):
        roots = repair.property_roots([{"name": "Value", "flag": 10},
                                       {"name": "Inner", "flag": 22},
                                       {"name": "Outer", "flag": 22}])
        self.assertEqual(len(roots), 1)
        self.assertEqual(roots[0]["name"], "Outer")

    def test_incomplete_map_is_rejected(self):
        with self.assertRaises(ValueError):
            repair.property_roots([{"name": "Map", "flag": 23}])


if __name__ == "__main__":
    unittest.main()
