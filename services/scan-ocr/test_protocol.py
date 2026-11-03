"""Parser contract tests without downloading OCR weights or importing torch."""
import ast
import pathlib
import re
import unittest

source = pathlib.Path(__file__).with_name('app.py').read_text()
function = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'transcribe_pages')

class Model:
    def predict(self, line, return_prob=False):
        return line, .95

scope = {'re': re, 'MODEL': Model(), 'line_crops': lambda image: image}
exec(compile(ast.Module(body=[function], type_ignores=[]), '<actual-page-parser>', 'exec'), scope)

class ProtocolTest(unittest.TestCase):
    def test_one_page(self):
        lines = [str(n)+'. A' for n in range(1,21)] + ['Câu 1:', 'Một ý đúng.', 'Câu 2:', 'Nội dung khác.']
        result = scope['transcribe_pages']([lines])
        self.assertEqual(result['fields']['q20']['text'], 'A')
        self.assertEqual(result['fields']['essay1']['text'], 'Một ý đúng.')
        self.assertEqual(result['fields']['essay2']['text'], 'Nội dung khác.')
        self.assertIn('\n',result['rawText'])
    def test_two_pages_and_conflicts(self):
        result = scope['transcribe_pages']([['1. A 2. B'], ['1. C', 'Câu 21:', 'Dòng một', 'Câu 22:', 'Dòng hai']])
        self.assertEqual(result['fields']['q1']['text'], '')
        self.assertEqual(result['fields']['q2']['text'], 'B')
        self.assertEqual(result['fields']['essay1']['text'], 'Dòng một')

if __name__ == '__main__':
    unittest.main()
