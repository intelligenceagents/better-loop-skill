#!/usr/bin/env python3
"""Check seed contracts and fixtures. This is not a production privacy sanitizer."""
import copy
import json
import math
import re
from pathlib import Path
from urllib.parse import unquote

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(path.read_text())


def share_errors(data, validator):
    errors = [error.message for error in validator.iter_errors(data)]
    if errors:
        return errors
    if len(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()) > 16384:
        errors.append('Candidate exceeds the 16 KiB limit')
    for items, key in [(data['human_behaviors'], 'indicator'), (data['kpis'], 'metric')]:
        if len({item[key] for item in items}) != len(items):
            errors.append(f'Duplicate {key}')
    if data['outcome'] == 'improved':
        primary = data['kpis'][0]
        favorable = primary['candidate_index'] < 100 if primary['direction'] == 'lower_is_better' else primary['candidate_index'] > 100
        if not favorable:
            errors.append('Improvement requires a favorable primary KPI')
    return errors


def evaluation_errors(data, validator):
    errors = [error.message for error in validator.iter_errors(data)]
    if errors:
        return errors
    protocol = data['protocol']
    ids = [trial['pair_id'] for trial in data['trials']]
    if len(set(ids)) != len(ids) or set(ids) != set(protocol['planned_pair_ids']):
        errors.append('Every planned pair must appear exactly once, including omissions')
    changes = data['summary']['paired_relative_changes_percent']
    if len(changes) != len(data['trials']):
        errors.append('One relative-change entry is required per pair')
        return errors
    metric = protocol['primary_metric']
    expected_direction = 'higher_is_better' if metric == 'quality_rubric' else 'lower_is_better'
    if protocol['direction'] != expected_direction:
        errors.append('Primary metric direction mismatch')
    for trial, reported in zip(data['trials'], changes):
        before, after = trial['baseline'], trial['candidate']
        b, a = before['metrics'][metric], after['metrics'][metric]
        usable = (before['status'] == after['status'] == 'completed' and b is not None and a is not None and b > 0)
        if not usable:
            if reported is not None:
                errors.append('Missing/zero-baseline/failed pair has no relative percentage')
            continue
        actual = 100 * ((b-a) if expected_direction == 'lower_is_better' else (a-b)) / b
        if reported is None or not math.isclose(reported, actual, abs_tol=0.000001):
            errors.append('Relative percentage disagrees with pair values')
    if data['summary']['outcome'] == 'improved':
        complete = all(v is not None for v in changes)
        quality = all(t['candidate']['quality_floor_passed'] is True and t['candidate']['critical_regression'] is False for t in data['trials'])
        if not (complete and quality and sum(changes)/len(changes) > 0 and protocol['compatibility'] == 'comparable'):
            errors.append('Improvement claim lacks comparable favorable evidence and quality')
        if protocol['kind'] == 'controlled_paired' and not protocol['frozen_before_execution']:
            errors.append('Controlled improvement requires a prespecified protocol')
    return errors


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def check_negative_cases(share, local, sv, ev):
    cases = []
    def reject(label, data, checker, validator):
        require(bool(checker(data, validator)), f'Invalid case accepted: {label}')
        cases.append(label)
    d = copy.deepcopy(share); d['email'] = 'fixture@example.test'
    reject('identity field', d, share_errors, sv)
    d = copy.deepcopy(share); d['task']['company'] = 'FICTIONAL_SENTINEL'
    reject('nested company field', d, share_errors, sv)
    d = copy.deepcopy(share); d['evidence_tier'] = 'independently_verified'
    reject('client assigned trust', d, share_errors, sv)
    d = copy.deepcopy(share); d['evidence']['quality_floor'] = 'unknown'
    reject('unknown quality win', d, share_errors, sv)
    d = copy.deepcopy(share); d['evidence']['critical_regression'] = 'observed'
    reject('quality regression win', d, share_errors, sv)
    d = copy.deepcopy(share); d['evidence']['compatibility'] = 'not_comparable'
    reject('incompatible comparison', d, share_errors, sv)
    d = copy.deepcopy(share); d['kpis'][0]['candidate_index'] = 110
    reject('unfavorable primary KPI', d, share_errors, sv)
    d = copy.deepcopy(share); d['human_behaviors'].append(copy.deepcopy(d['human_behaviors'][0]))
    reject('duplicate behavior', d, share_errors, sv)
    d = copy.deepcopy(share); d['human_behaviors'][0]['state'] = 'not_observed'
    reject('rating absent behavior', d, share_errors, sv)
    d = copy.deepcopy(share); d['kpis'][0]['candidate_index'] = 73
    reject('unrounded public KPI', d, share_errors, sv)
    d = copy.deepcopy(local); d['trials'].pop()
    reject('omitted planned trial', d, evaluation_errors, ev)
    d = copy.deepcopy(local); d['trials'][0]['baseline']['metrics']['model_tokens'] = 0
    reject('zero baseline percentage', d, evaluation_errors, ev)
    d = copy.deepcopy(local); d['trials'][0]['baseline']['metrics']['model_tokens'] = None
    reject('missing baseline percentage', d, evaluation_errors, ev)
    d = copy.deepcopy(local); d['summary']['paired_relative_changes_percent'][0] = 90
    reject('fabricated percentage', d, evaluation_errors, ev)
    d = copy.deepcopy(local); d['trials'][0]['candidate']['quality_floor_passed'] = False
    reject('local quality regression', d, evaluation_errors, ev)
    # A correctly represented unknown is valid; the checker must not require fabricated data.
    d = copy.deepcopy(local); d['trials'][0]['baseline']['metrics']['model_tokens'] = None
    d['summary']['paired_relative_changes_percent'][0] = None
    d['summary']['outcome'] = 'insufficient_evidence'
    require(not evaluation_errors(d, ev), 'Correctly represented missing evidence rejected')
    return len(cases), 1


def check_links():
    count = 0
    for path in ROOT.rglob('*.md'):
        if '.git' in path.parts:
            continue
        content = re.sub(r'```.*?```', '', path.read_text(), flags=re.S)
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', content):
            if re.match(r'^[a-z]+:', target) or target.startswith('#'):
                continue
            target = unquote(target.split('#', 1)[0].split(' "', 1)[0].strip('<>'))
            require((path.parent / target).exists(), f'Broken local link: {path.relative_to(ROOT)} -> {target}')
            count += 1
    return count


def main():
    validators = {}
    for name in ('share-candidate', 'evaluation-run'):
        schema = load(ROOT / f'schemas/{name}.schema.json')
        Draft202012Validator.check_schema(schema)
        validators[name] = Draft202012Validator(schema, format_checker=FormatChecker())
    sv, ev = validators['share-candidate'], validators['evaluation-run']
    count = 0
    for path in sorted((ROOT/'examples').glob('*.synthetic.json')):
        data = load(path)
        require(data['content_origin'] == 'synthetic', f'Unlabeled synthetic fixture: {path.name}')
        checker, validator = (evaluation_errors, ev) if path.name.startswith('evaluation-run') else (share_errors, sv)
        errors = checker(data, validator)
        require(not errors, f'{path.name}: {errors}')
        count += 1
    negative, missing = check_negative_cases(load(ROOT/'examples/software-story.synthetic.json'), load(ROOT/'examples/evaluation-run.synthetic.json'), sv, ev)
    scenarios = load(ROOT/'evals/scenarios.json')['scenarios']
    require(len({x['id'] for x in scenarios}) == len(scenarios), 'Duplicate evaluation scenario')
    require(all(x['prompt'] and x['expected'] for x in scenarios), 'Incomplete evaluation scenario')
    links = check_links()
    print(f'PASS: 2 schemas, {count} synthetic fixtures, {negative} rejection cases, {missing} missing-evidence case, {len(scenarios)} scenario definitions, {links} local links.')
    print('Not tested: model behavior, sanitizer effectiveness, host compatibility, live service, or real improvement.')


if __name__ == '__main__':
    main()
