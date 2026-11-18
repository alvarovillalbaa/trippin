"""Remote-only workspace qualification for the approved, owned QA packet.

The example workflow is not installed. This supervisor never reuses a closed
consumer packet, imports credentials, changes manifests, or accepts a supplied
ledger as independently verified GitHub billing evidence.
"""
import hashlib
import http.client
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import threading
import time
import uuid

REPOSITORY = "alvarovillalbaa/trippin"
QA_REF = "refs/heads/qa/trippin-workspace-reliability-20261116"
ORIGIN = "http://127.0.0.1:4318"
DRIVER = "tests/integration/browser/workspace-reliability.mjs"
MATRIX = "tests/integration/browser/workspace-reliability-matrix.md"
SUPERVISOR = "tests/scripts/qualify-workspace-reliability.py"
FOCUSED = (
    "tests/unit/workspace-saving.test.mjs", "tests/unit/workspace-map.test.mjs",
    "tests/unit/itinerary-days.test.mjs", "tests/unit/custom-alternatives.test.mjs",
    "tests/unit/workspace-forms.test.mjs",
    "tests/unit/manual-trip-edits.test.mjs", "tests/unit/manual-trip-edit-ui.test.mjs",
    "tests/unit/restore-dialog-intent.test.mjs",
)
ROOTS = ("app", "components", "lib", "agent", "public")
FILES = (
    "package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts",
    *FOCUSED, "tests/factories/legacy-workspace.mjs", DRIVER, MATRIX,
)
NODE = "v24.21.0"
PLAYWRIGHT = "1.61.1"
CASES = ["R-N01", "R-N02", "R-N03", "R-N04"]
STREAM_CAP = 1024 * 1024
EVIDENCE_FILE_CAP = 2 * 1024 * 1024
EVIDENCE_TOTAL_CAP = 16 * 1024 * 1024
REQUIRED_FREE = 34 * 1024**3  # 30 GiB reserve plus the 4 GiB estimate.
sha = lambda value: hashlib.sha256(value).hexdigest()


def need(condition, code):
    if not condition:
        raise RuntimeError(code)


def read_regular(path, maximum=16 * 1024 * 1024):
    before = path.lstat()
    need(stat.S_ISREG(before.st_mode) and not path.is_symlink() and before.st_size <= maximum, "file_type_or_bound")
    value = path.read_bytes()
    after = path.lstat()
    need((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
         == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
         and len(value) == before.st_size, "file_changed_during_read")
    return value


def git(repo, *args):
    return subprocess.check_output(["git", *args], cwd=repo, timeout=10, stderr=subprocess.DEVNULL)


def vector(root, names):
    return [{"path": name, "bytes": len(value), "sha256": sha(value)}
            for name in names for value in [read_regular(root / name)]]


def write_json(path, value):
    data = (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()
    need(len(data) <= EVIDENCE_FILE_CAP, "json_evidence_bound")
    path.write_bytes(data)


def proc_bytes(path, maximum):
    with path.open("rb") as stream:
        value = stream.read(maximum + 1)
    need(len(value) <= maximum, "proc_field_bound")
    return value


def proc_identity(pid):
    entry = Path("/proc") / str(pid)
    uid = entry.stat().st_uid
    fields = proc_bytes(entry / "stat", 8192).decode().rsplit(") ", 1)[1].split()
    need(len(fields) >= 20 and fields[19].isdigit(), "proc_identity_shape")
    return {"pid": pid, "uid": uid, "state": fields[0], "parent": int(fields[1]),
            "group": int(fields[2]), "session": int(fields[3]), "startTicks": fields[19]}


def process_diagnostic(diagnostics, stage, field, identity):
    item = {"stage": stage, "field": field, **identity}
    if item not in diagnostics:
        need(len(diagnostics) < 64, "proc_diagnostic_bound")
        diagnostics.append(item)


def baseline_processes(diagnostics):
    """Record exact pre-existing identities before the first managed launch."""
    found = {}
    entries = [entry for entry in Path("/proc").iterdir() if entry.name.isdigit()]
    need(len(entries) <= 8192, "proc_inventory_bound")
    for entry in entries:
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            item = proc_identity(int(entry.name))
            need(len(found) < 1024, "proc_baseline_bound")
            found[(item["pid"], item["startTicks"])] = item
        except (FileNotFoundError, ProcessLookupError):
            continue
        except PermissionError:
            process_diagnostic(diagnostics, "baseline", "identity", {"pid": int(entry.name)})
            raise RuntimeError("baseline_process_identity_unreadable") from None
    return found


def owned_processes(root, nonce, baseline, sessions, diagnostics, observed):
    """Attribute processes without demanding ptrace access to unrelated peers.

    Only exact pre-launch identities outside owned sessions are exempt. New
    unattributed/unreadable identities still fail; raw argv/env/cwd stay private.
    """
    found = []
    marker = ("TRIPPIN_RELIABILITY_RUN_NONCE=" + nonce).encode()
    prefix = os.fsencode(root) + b"/"
    entries = [entry for entry in Path("/proc").iterdir() if entry.name.isdigit()]
    need(len(entries) <= 8192, "proc_inventory_bound")
    for entry in entries:
        item = {"pid": int(entry.name)}
        field = "identity"
        try:
            if entry.stat().st_uid != os.getuid():
                continue
            item = proc_identity(int(entry.name))
            # A zombie has no executable work or open file descriptors.
            if item["state"] == "Z" or item["pid"] == os.getpid():
                continue
            session = sessions.get(item["session"])
            if session:
                try:
                    leader = proc_identity(item["session"])
                    need(leader["startTicks"] == session["startTicks"], "owned_session_identity_reused")
                except (FileNotFoundError, ProcessLookupError):
                    pass  # A session can outlive its original leader.
                need(int(item["startTicks"]) >= int(session["startTicks"]), "owned_session_birth_invalid")
                basis = "launched-session"
            elif (item["pid"], item["startTicks"]) in baseline:
                continue
            else:
                field = "environ"
                environ = proc_bytes(entry / "environ", 65536)
                field = "cmdline"
                args = proc_bytes(entry / "cmdline", 65536)
                field = "cwd"
                cwd = os.fsencode(os.readlink(entry / "cwd"))
                need(len(cwd) <= 4096, "proc_cwd_bound")
                if marker in environ.split(b"\0"):
                    basis = "task-nonce"
                elif prefix in args or cwd.startswith(prefix) or cwd == os.fsencode(root):
                    basis = "owned-root"
                else:
                    continue
            field = "identity-readback"
            current = proc_identity(item["pid"])
            need(current["startTicks"] == item["startTicks"] and current["uid"] == item["uid"]
                 and current["session"] == item["session"], "proc_identity_changed")
            row = {**current, "basis": basis}
            key = (row["pid"], row["startTicks"])
            need(key in observed or len(observed) < 256, "owned_process_inventory_bound")
            observed[key] = row
            found.append(row)
        except (FileNotFoundError, ProcessLookupError):
            continue
        except PermissionError:
            process_diagnostic(diagnostics, "ownership", field, item)
            raise RuntimeError("owned_process_inventory_unreadable") from None
        except RuntimeError:
            process_diagnostic(diagnostics, "ownership", field, item)
            raise
    return found


def group_absent(pid):
    try:
        os.killpg(pid, 0)
        return False
    except ProcessLookupError:
        return True


def server_shutdown_accepted(record):
    """Accept Next's 143 only after this supervisor's verified live SIGTERM.

    Next 16.4.2 start-server.ts explicitly exits 143 after graceful SIGTERM
    cleanup. A bare exit code, spontaneous exit or escalated kill is not proof.
    """
    ready = record.get("readiness") or {}
    signals = record.get("stopSignals", [])
    if (ready.get("status") != 200 or ready.get("origin") != ORIGIN
            or record.get("leaderReaped") is not True or record.get("groupAbsent") is not True
            or record.get("eof") is not True or record.get("streamFailure") is not False
            or record.get("forcedKill") is not False
            or any(item.get("signal") != "SIGTERM" for item in signals)):
        return False
    if record.get("code") == 0:
        return True
    if record.get("code") != 143 or len(signals) != 1:
        return False
    stopped = signals[0]
    launch, live = record.get("launchIdentity"), stopped.get("leaderIdentity")
    keys = ("pid", "uid", "group", "session", "startTicks")
    return bool(stopped.get("signal") == "SIGTERM" and stopped.get("sent") is True
                and stopped.get("liveLeaderVerified") is True and isinstance(launch, dict) and isinstance(live, dict)
                and all(key in launch and key in live and launch[key] == live[key] for key in keys)
                and isinstance(launch["pid"], int) and launch["pid"] > 0
                and isinstance(launch["uid"], int) and launch["uid"] >= 0
                and isinstance(launch["startTicks"], str) and launch["startTicks"].isdigit()
                and launch["group"] == launch["session"] == launch["pid"])


class Capture:
    """Drain both pipes while retaining a bounded, hash-bound original prefix."""
    def __init__(self, process, output, name):
        self.streams = {}
        self.threads = []
        for suffix, pipe in (("stdout", process.stdout), ("stderr", process.stderr)):
            item = {"bytes": 0, "storedBytes": 0, "truncated": False, "eof": False, "error": None}
            self.streams[suffix] = item

            def drain(pipe=pipe, suffix=suffix, item=item):
                digest = hashlib.sha256()
                try:
                    with (output / (name + "." + suffix + ".txt")).open("xb") as target:
                        while value := pipe.read(65536):
                            digest.update(value)
                            item["bytes"] += len(value)
                            prefix = value[:max(0, STREAM_CAP - item["storedBytes"])]
                            target.write(prefix)
                            item["storedBytes"] += len(prefix)
                            item["truncated"] = item["bytes"] > STREAM_CAP
                    item["eof"] = True
                except Exception as error:
                    item["error"] = type(error).__name__
                finally:
                    item["sha256"] = digest.hexdigest()
                    pipe.close()

            thread = threading.Thread(target=drain, daemon=True)
            thread.start()
            self.threads.append(thread)

    def failed(self):
        return any(item["truncated"] or item["error"] for item in self.streams.values())

    def finish(self):
        for thread in self.threads:
            thread.join(timeout=2)
        return all(item["eof"] and not item["error"] for item in self.streams.values())


def main():
    # Refuse local execution before making directories or starting any child.
    need(sys.platform == "linux" and os.uname().machine == "x86_64", "public_linux_runner_required")
    need(os.environ.get("GITHUB_ACTIONS") == "true" and os.environ.get("CI") == "true"
         and os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
         and os.environ.get("GITHUB_EVENT_NAME") == "push"
         and os.environ.get("GITHUB_REF") == QA_REF
         and os.environ.get("GITHUB_RUN_ATTEMPT") == "1"
         and os.environ.get("TRIPPIN_RELIABILITY_APPROVED") == "1", "fresh_authorized_owned_push_required")
    repo = Path(__file__).resolve().parents[2]
    runner = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
    home = Path(os.environ["HOME"]).resolve(strict=True)
    need(runner.is_dir() and home.is_dir(), "runner_and_original_home_required")
    event = json.loads(read_regular(Path(os.environ["GITHUB_EVENT_PATH"]), 262144))
    need(event.get("repository", {}).get("private") is False
         and event["repository"].get("full_name") == REPOSITORY, "public_repository_event_required")
    # The publisher freezes these reviewed values in the owned workflow. Push
    # payload text is never interpreted as code or accepted as launch settings.
    inputs = {"source_sha": os.environ.get("TRIPPIN_RELIABILITY_SOURCE_SHA", ""),
              "spent_seconds": os.environ.get("TRIPPIN_RELIABILITY_SPENT_SECONDS", ""),
              "previous_source_sha": os.environ.get("TRIPPIN_RELIABILITY_PREVIOUS_SOURCE_SHA", ""),
              "previous_input_digest": os.environ.get("TRIPPIN_RELIABILITY_PREVIOUS_INPUT_DIGEST", ""),
              "ledger_sha256": os.environ.get("TRIPPIN_RELIABILITY_LEDGER_SHA256", "")}
    source_sha = inputs["source_sha"]
    workflow_sha = os.environ.get("GITHUB_SHA", "")
    need(event.get("after") == workflow_sha and event.get("ref") == QA_REF
         and event.get("deleted") is False and event.get("forced") is False, "reviewed_nonforced_push_event_required")
    need(re.fullmatch(r"[a-f0-9]{40}", source_sha) and re.fullmatch(r"[a-f0-9]{40}", workflow_sha)
         and source_sha != workflow_sha and git(repo, "rev-parse", "HEAD").decode().strip() == source_sha,
         "distinct_reviewed_source_and_workflow_required")
    need(re.fullmatch(r"0|[1-9][0-9]{0,3}", inputs.get("spent_seconds", "")), "verified_ledger_seconds_required")
    spent = int(inputs["spent_seconds"])
    previous_sha, previous_digest = inputs.get("previous_source_sha", ""), inputs.get("previous_input_digest", "")
    need(re.fullmatch(r"[a-f0-9]{64}", inputs.get("ledger_sha256", "")), "publisher_verified_ledger_digest_required")
    need((spent == 0 and previous_sha == previous_digest == "none")
         or (re.fullmatch(r"[a-f0-9]{40}", previous_sha)
             and re.fullmatch(r"[a-f0-9]{64}", previous_digest)), "inconsistent_prior_attempt_inputs")
    need(spent + 720 <= 1200 and previous_sha != source_sha, "cumulative_twenty_minute_or_unchanged_source_refusal")
    start_text = os.environ.get("TRIPPIN_RELIABILITY_JOB_STARTED_MS", "")
    need(re.fullmatch(r"[0-9]{13}", start_text), "earliest_job_timestamp_required")
    job_started = int(start_text) / 1000
    setup_seconds = time.time() - job_started
    need(0 <= setup_seconds < 300, "job_setup_window_expired")
    # 660 s internal deadline includes 90 s cleanup; the 12-minute job leaves
    # another minute for artifact upload/post steps. Prior seconds are a reviewed
    # frozen workflow input, not an API-verified bill; publisher reads final job duration.
    hard_deadline = time.monotonic() + 660 - setup_seconds
    work_deadline = hard_deadline - 90
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    need(re.fullmatch(r"[0-9]+", run_id), "run_identity_required")
    output = runner / ("trippin-workspace-reliability-" + run_id)
    need(output.parent.resolve(strict=True) == runner and output.name == "trippin-workspace-reliability-" + run_id
         and not output.exists() and not output.is_symlink(), "new_owned_artifact_directory_required")
    output.mkdir(mode=0o700)
    output_stat = output.lstat()
    output_identity = (output_stat.st_dev, output_stat.st_ino, output_stat.st_uid)
    receipt = {"schemaVersion": "trippin.workspace-reliability.v1", "passed": False,
               "sourceSha": source_sha, "workflowSha": workflow_sha, "origin": ORIGIN,
               "trigger": {"event": "push", "ref": QA_REF, "after": workflow_sha, "deleted": False, "forced": False},
               "cases": CASES, "commands": [], "cleanup": False, "serverClosed": False,
               "scope": {"tier": "tier2", "authoredGuestTransport": True, "realAuth": False,
                         "providers": False, "models": False, "serverWrites": False, "priorPacketsRepeated": False},
               "budget": {"priorSeconds": spent, "ledgerSha256": inputs["ledger_sha256"],
                          "priorSourceSha": previous_sha, "priorInputDigest": previous_digest,
                          "jobReserveSeconds": 720, "internalSeconds": 660, "cleanupReserveSeconds": 90,
                          "cumulativeLimitSeconds": 1200, "finalGitHubJobLedgerReadbackRequired": True}}
    scratch = None
    source = None
    processes = []
    server = None
    before = None
    names = []
    interrupted = False
    forced_orphans = []
    process_baseline = {}
    baseline_captured = False
    owned_sessions = {}
    process_diagnostics = []
    observed_owned = {}

    def on_signal(signum, frame):
        nonlocal interrupted
        interrupted = True

    for name in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(name, on_signal)

    def ownership():
        current = scratch.lstat()
        marker = scratch / ".owner"
        need(scratch.parent == runner and stat.S_ISDIR(current.st_mode) and not scratch.is_symlink()
             and (current.st_dev, current.st_ino, current.st_uid) == identity
             and stat.S_IMODE(current.st_mode) == 0o700
             and marker.lstat().st_uid == os.getuid()
             and stat.S_IMODE(marker.lstat().st_mode) == 0o600
             and read_regular(marker, 64).decode() == nonce, "scratch_ownership_changed")

    def inventory():
        if not processes:
            return []
        need(baseline_captured, "process_baseline_missing")
        return owned_processes(scratch, nonce, process_baseline, owned_sessions, process_diagnostics, observed_owned)

    def prove_group(handle):
        process = handle["process"]
        if process.poll() is None:
            try:
                current = proc_identity(process.pid)
                expected = handle.get("identity")
                need(expected and current["startTicks"] == expected["startTicks"]
                     and current["uid"] == expected["uid"] and current["group"] == process.pid
                     and current["session"] == process.pid, "live_process_group_identity_changed")
                return current
            except (FileNotFoundError, ProcessLookupError):
                need(process.poll() is not None, "live_process_identity_unreadable")
            except PermissionError:
                process_diagnostic(process_diagnostics, "group-stop", "identity", {"pid": process.pid})
                raise RuntimeError("live_process_identity_unreadable") from None
        members = inventory()
        need(any(item["group"] == process.pid and item["session"] == process.pid for item in members),
             "process_group_ownership_unknown")

    def send_stop_signal(handle, signum):
        proof = prove_group(handle)
        item = {"signal": signal.Signals(signum).name, "sent": False,
                "liveLeaderVerified": proof is not None and handle["process"].poll() is None,
                "leaderIdentity": proof}
        handle.setdefault("stopSignals", []).append(item)
        if signum == signal.SIGKILL:
            handle["forcedKill"] = True
        try:
            os.killpg(handle["process"].pid, signum)
            item["sent"] = True
        except ProcessLookupError:
            pass

    def stop(handle):
        process = handle["process"]
        if not group_absent(process.pid):
            send_stop_signal(handle, signal.SIGTERM)
        end = min(time.monotonic() + 8, hard_deadline - 10)
        while time.monotonic() < end and (process.poll() is None or not group_absent(process.pid)):
            time.sleep(.05)
        if not group_absent(process.pid):
            send_stop_signal(handle, signal.SIGKILL)
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            pass
        eof = handle["capture"].finish()
        return process.poll() is not None and group_absent(process.pid) and eof

    def bounds():
        current = output.lstat()
        need(stat.S_ISDIR(current.st_mode) and not output.is_symlink()
             and (current.st_dev, current.st_ino, current.st_uid) == output_identity
             and stat.S_IMODE(current.st_mode) == 0o700, "artifact_directory_identity_changed")
        paths = list(output.rglob("*"))
        need(len(paths) <= 100 and not any(path.is_symlink() for path in paths), "evidence_file_count_or_symlink")
        files = [path for path in paths if path.is_file()]
        need(all(path.stat().st_size <= EVIDENCE_FILE_CAP for path in files)
             and sum(path.stat().st_size for path in files) <= EVIDENCE_TOTAL_CAP, "evidence_size_bound")

    def launch(name, argv, cwd):
        need(not interrupted and time.monotonic() < work_deadline, "work_deadline_or_interruption")
        process = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        handle = {"name": name, "process": process, "capture": Capture(process, output, name), "started": time.monotonic(),
                  "argv": argv, "stopSignals": [], "forcedKill": False}
        processes.append(handle)
        try:
            identity = proc_identity(process.pid)
            need(identity["uid"] == os.getuid() and identity["group"] == process.pid
                 and identity["session"] == process.pid, "managed_session_identity_invalid")
            handle["identity"] = identity
            owned_sessions[process.pid] = identity
        except (FileNotFoundError, ProcessLookupError):
            need(process.poll() is not None and group_absent(process.pid), "managed_launch_identity_missing")
        except PermissionError:
            process_diagnostic(process_diagnostics, "launch", "identity", {"pid": process.pid})
            raise RuntimeError("managed_launch_identity_unreadable") from None
        return handle

    def execute(name, argv, timeout, cwd):
        handle = launch(name, argv, cwd)
        process, capture = handle["process"], handle["capture"]
        end = min(time.monotonic() + timeout, work_deadline)
        problem = None
        while process.poll() is None:
            if interrupted or time.monotonic() >= end:
                problem = "command_deadline_or_interruption"
            if capture.failed() or server and server["capture"].failed():
                problem = "stream_limit_or_capture_failure"
            try:
                bounds()
            except RuntimeError as error:
                problem = str(error)
            if problem:
                stop(handle)
                break
            time.sleep(.05)
        eof = capture.finish()
        group_wait_started = time.monotonic()
        group_wait_deadline = min(group_wait_started + 3, work_deadline)
        absent = group_absent(process.pid)
        while not absent and time.monotonic() < group_wait_deadline:
            time.sleep(min(.05, max(0, group_wait_deadline - time.monotonic())))
            absent = group_absent(process.pid)
        item = {"name": name, "argv": argv, "code": process.poll(), "leaderReaped": process.poll() is not None,
                "groupAbsent": absent, "eof": eof, "seconds": round(time.monotonic() - handle["started"], 3),
                "groupClosureWaitSeconds": round(time.monotonic() - group_wait_started, 3),
                "streams": capture.streams, "error": problem}
        receipt["commands"].append(item)
        need(not problem and process.returncode == 0 and absent and eof and not capture.failed(), name + "_failed")

    try:
        free = shutil.disk_usage(runner).free
        receipt["storage"] = {"freeBytes": free, "requiredBytes": REQUIRED_FREE, "passed": free >= REQUIRED_FREE}
        need(free >= REQUIRED_FREE, "runner_storage_guard_refused")
        need(not git(repo, "status", "--porcelain", "--untracked-files=all").strip(), "reviewed_checkout_must_be_clean")
        names = sorted(os.fsdecode(value) for value in git(repo, "ls-tree", "-r", "-z", "--name-only", source_sha, "--", *ROOTS, *FILES).split(b"\0") if value)
        need(set(FILES).issubset(names) and any(name.startswith("app/") for name in names), "required_allowlisted_source_missing")
        need(all((Path(name).parts[0] in ROOTS or name in FILES)
                 and not any(part.startswith(".env") or part in ("node_modules", ".git", ".vercel", "results") for part in Path(name).parts)
                 for name in names), "source_allowlist_refused")
        before = vector(repo, names + [SUPERVISOR])
        need(sum(item["bytes"] for item in before) <= 64 * 1024 * 1024, "source_copy_bound")
        digest = sha(json.dumps(before, separators=(",", ":"), sort_keys=True).encode())
        receipt["inputDigest"] = digest
        need(digest != previous_digest, "unchanged_input_digest_refused")
        write_json(output / "source-before.json", before)
        write_json(output / "source.json", {"sourceSha": source_sha, "workflowSha": workflow_sha,
                                           "inputDigest": digest, "paths": names, "supervisorPath": SUPERVISOR})
        scratch = Path(tempfile.mkdtemp(prefix="trippin-workspace-", dir=runner))
        scratch.chmod(0o700)
        nonce = uuid.uuid4().hex
        marker = scratch / ".owner"
        marker.write_text(nonce)
        marker.chmod(0o600)
        owned = scratch.lstat()
        identity = (owned.st_dev, owned.st_ino, owned.st_uid)
        ownership()
        source = scratch / "source"
        source.mkdir(mode=0o700)
        for name in names:
            target = source / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(repo / name, target)
        for directory in ("tmp", "cache", "config", "data", "state", "browsers", "tool"):
            (scratch / directory).mkdir(mode=0o700)
        for name in ("npm-user", "npm-global"):
            (scratch / name).write_text("")
        env = {"PATH": os.environ["PATH"], "HOME": os.environ["HOME"], "LANG": "C.UTF-8", "TZ": "UTC", "CI": "true",
               "NODE_ENV": "production", "NEXT_TELEMETRY_DISABLED": "1", "GITHUB_SHA": source_sha,
               "TMPDIR": str(scratch / "tmp"), "TMP": str(scratch / "tmp"), "TEMP": str(scratch / "tmp"),
               "XDG_CACHE_HOME": str(scratch / "cache"), "XDG_CONFIG_HOME": str(scratch / "config"),
               "XDG_DATA_HOME": str(scratch / "data"), "XDG_STATE_HOME": str(scratch / "state"),
               "npm_config_cache": str(scratch / "cache" / "npm"), "npm_config_userconfig": str(scratch / "npm-user"),
               "npm_config_globalconfig": str(scratch / "npm-global"), "npm_config_registry": "https://registry.npmjs.org/",
               "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_TERMINAL_PROMPT": "0",
               "PLAYWRIGHT_BROWSERS_PATH": str(scratch / "browsers"), "PLAYWRIGHT_HTML_OPEN": "never",
               "TRIPPIN_RELIABILITY_ORIGIN": ORIGIN, "TRIPPIN_RELIABILITY_OUTPUT": str(output),
               "TRIPPIN_RELIABILITY_APPROVED": "1", "TRIPPIN_RELIABILITY_RUN_NONCE": nonce}
        receipt["originalHomePreserved"] = env["HOME"] == os.environ["HOME"]
        receipt["providerEnvironmentPassed"] = False
        process_baseline = baseline_processes(process_diagnostics)
        baseline_captured = True
        execute("node-version", ["node", "--version"], 10, source)
        need((output / "node-version.stdout.txt").read_text().strip() == NODE, "pinned_node_runtime_required")
        execute("dependencies", ["npm", "ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"], 140, source)
        execute("focused-frontend", ["node", "--test", "--test-reporter=tap", *FOCUSED], 30, source)
        tap = (output / "focused-frontend.stdout.txt").read_text()
        totals = {key: int(value) for key, value in re.findall(r"^# (tests|pass|fail|cancelled|skipped|todo) ([0-9]+)$", tap, re.M)}
        need(totals.get("tests", 0) > 0 and totals.get("pass") == totals["tests"]
             and all(totals.get(key) == 0 for key in ("fail", "cancelled", "skipped", "todo")), "complete_focused_controls_required")
        execute("next-typegen", [str(source / "node_modules/.bin/next"), "typegen"], 45, source)
        execute("typescript", ["npm", "run", "check"], 60, source)
        execute("next-build", ["npm", "run", "build"], 180, source)
        execute("eve-build", ["npm", "run", "agent:build"], 120, source)
        tool = scratch / "tool"
        (tool / "package.json").write_text('{"name":"trippin-workspace-reliability-tool","version":"0.0.0","private":true}')
        execute("browser-tool", ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "@playwright/test@" + PLAYWRIGHT], 70, tool)
        write_json(output / "browser-tool-lock.json", json.loads(read_regular(tool / "package-lock.json")))
        installed = json.loads(read_regular(tool / "node_modules/@playwright/test/package.json"))
        need(installed.get("version") == PLAYWRIGHT, "pinned_playwright_required")
        execute("browser-install", [str(tool / "node_modules/.bin/playwright"), "install", "chromium"], 100, tool)
        env["TRIPPIN_PLAYWRIGHT_PACKAGE"] = str(tool / "package.json")
        server = launch("server", ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4318"], source)
        ready_deadline = min(time.monotonic() + 25, work_deadline)
        while True:
            need(not interrupted and server["process"].poll() is None and not server["capture"].failed()
                 and time.monotonic() < ready_deadline, "built_server_readiness_failed")
            connection = http.client.HTTPConnection("127.0.0.1", 4318, timeout=1)
            try:
                connection.request("GET", "/", headers={"Host": "127.0.0.1:4318"})
                response = connection.getresponse()
                if response.status == 200:
                    server["readiness"] = {"status": 200, "origin": ORIGIN,
                                           "seconds": round(time.monotonic() - server["started"], 3)}
                    break
            except (ConnectionError, OSError, http.client.HTTPException):
                pass
            finally:
                connection.close()
            time.sleep(.1)
        execute("four-native-cases", ["node", DRIVER], 180, source)
        native = json.loads(read_regular(output / "native-result.json", EVIDENCE_FILE_CAP))
        cases = native.get("cases", [])
        need(native.get("passed") is True and native.get("browserClosed") is True
             and [case.get("id") for case in cases] == CASES
             and all(case.get("passed") is True and case.get("contextClosed") is True
                     and case.get("unexpectedNetwork") == [] and case.get("pageErrors") == [] for case in cases),
             "all_four_fresh_native_cases_and_closure_required")
        receipt["native"] = {"caseIds": CASES, "browserClosed": True, "resultSha256": sha(read_regular(output / "native-result.json"))}
        receipt["passed"] = True
    except Exception as error:
        receipt["error"] = str(error) if re.fullmatch(r"[A-Za-z0-9_ -]{1,140}", str(error)) else type(error).__name__
    finally:
        if scratch:
            try:
                for handle in reversed(processes):
                    try:
                        closed = stop(handle)
                        if handle is server:
                            receipt["server"] = {"code": handle["process"].poll(), "groupAbsent": group_absent(handle["process"].pid),
                                                 "leaderReaped": handle["process"].poll() is not None,
                                                 "eof": all(item["eof"] for item in handle["capture"].streams.values()),
                                                 "streamFailure": handle["capture"].failed(), "readiness": handle.get("readiness"),
                                                 "launchIdentity": handle.get("identity"), "stopSignals": handle["stopSignals"],
                                                 "forcedKill": handle["forcedKill"], "streams": handle["capture"].streams}
                            receipt["serverClosed"] = closed and server_shutdown_accepted(receipt["server"])
                    except Exception as error:
                        receipt.setdefault("processCleanupErrors", []).append({"name": handle["name"], "error": type(error).__name__})
                ownership()
                for _ in range(20):
                    remaining = inventory()
                    if not remaining:
                        break
                    time.sleep(.05)
                forced_orphans = remaining
                for item in remaining:
                    current = inventory()
                    if any(value["pid"] == item["pid"] and value["startTicks"] == item["startTicks"] for value in current):
                        try:
                            os.kill(item["pid"], signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                time.sleep(.1)
                for item in inventory():
                    try:
                        current = proc_identity(item["pid"])
                        need(current["startTicks"] == item["startTicks"], "orphan_process_identity_changed")
                        os.kill(item["pid"], signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                for _ in range(20):
                    remaining = inventory()
                    if not remaining:
                        break
                    time.sleep(.05)
                receipt["ownedProcessesRemaining"] = remaining
                receipt["forcedOrphanTermination"] = forced_orphans
                if before and source:
                    try:
                        copied = vector(source, names)
                        write_json(output / "copied-source-after.json", copied)
                        changed = [new["path"] for old, new in zip(before[:len(names)], copied) if old != new]
                        receipt["generatedTypeFilesChanged"] = changed
                        receipt["copiedSourceGuardPassed"] = all(name == "next-env.d.ts" for name in changed)
                    except Exception as error:
                        receipt["copiedSourceGuardPassed"] = False
                        receipt["copiedSourceGuardError"] = type(error).__name__
                need(not remaining and all(group_absent(handle["process"].pid) for handle in processes), "owned_processes_still_present")
                ownership()
                shutil.rmtree(scratch)
                receipt["cleanup"] = not scratch.exists()
            except Exception as error:
                receipt["cleanupError"] = str(error) if re.fullmatch(r"[A-Za-z0-9_ -]{1,140}", str(error)) else type(error).__name__
        if before:
            try:
                after = vector(repo, names + [SUPERVISOR])
                write_json(output / "source-after.json", after)
                receipt["originalSourceUnchanged"] = before == after
                receipt["sourceGuardPassed"] = before == after and receipt.get("copiedSourceGuardPassed", False)
            except Exception as error:
                receipt["sourceGuardError"] = type(error).__name__
        receipt["processInventory"] = {"baselineCaptured": baseline_captured, "baselineCount": len(process_baseline),
                                       "launchedSessions": len(owned_sessions), "observedOwned": len(observed_owned),
                                       "diagnosticCount": len(process_diagnostics)}
        write_json(output / "process-inventory.json", {
            "basis": "Exact pre-launch PID/startTicks outside owned sessions; created-session, nonce/root attribution; unknown unreadable identities fail",
            "baselineCaptured": baseline_captured, "baseline": list(process_baseline.values()),
            "launchedSessions": list(owned_sessions.values()), "observedOwned": list(observed_owned.values()),
            "diagnostics": process_diagnostics,
        })
        receipt["interrupted"] = interrupted
        receipt["budget"]["observedSecondsThroughCleanup"] = math.ceil(time.time() - job_started)
        receipt["budget"]["provisionalCumulativeSeconds"] = spent + receipt["budget"]["observedSecondsThroughCleanup"]
        receipt["passed"] = bool(receipt["passed"] and receipt.get("sourceGuardPassed") and receipt["cleanup"]
                                 and receipt["serverClosed"] and not interrupted and not forced_orphans
                                 and not receipt.get("processCleanupErrors")
                                 and time.monotonic() <= hard_deadline)
        try:
            bounds()
        except RuntimeError as error:
            receipt["passed"] = False
            receipt["evidenceError"] = str(error)
        write_json(output / "receipt.json", receipt)
        files = [{"path": path.relative_to(output).as_posix(), "bytes": path.stat().st_size, "sha256": sha(read_regular(path, EVIDENCE_FILE_CAP))}
                 for path in sorted(output.rglob("*")) if path.is_file() and not path.is_symlink() and path.stat().st_size <= EVIDENCE_FILE_CAP]
        write_json(output / "artifact-index.json", files)
        print("TRIPPIN_WORKSPACE_RELIABILITY_RECEIPT " + json.dumps(receipt, sort_keys=True), flush=True)
    return 0 if receipt["passed"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print("TRIPPIN_WORKSPACE_RELIABILITY_PREFLIGHT " + type(error).__name__ + ": " + str(error), file=sys.stderr)
        raise SystemExit(1) from None
