"""SPEC-001 AC-C32 (K-4, N-5): cleanup görevleri worker'a kayıtlı ve beat'te zamanlı."""
from app.tasks.celery_app import celery_app


def test_cleanup_tasks_included_scheduled_and_registered():
    # Not: assert mesajına celery_app.conf girmesin (broker URL'si parola içerir); yerel değişkenlerle karşılaştır.
    include = list(celery_app.conf.include)
    assert "app.tasks.cleanup_tasks" in include
    for m in ("app.tasks.sync_tasks", "app.tasks.action_tasks", "app.tasks.ghost_tasks"):
        assert m in include
    celery_app.loader.import_default_modules()
    registered = set(celery_app.tasks)
    assert "cleanup_stale" in registered
    assert "cleanup_retention" in registered
    sched = dict(celery_app.conf.beat_schedule)
    assert sched["cleanup-stale"]["task"] == "cleanup_stale"
    assert sched["cleanup-stale"]["schedule"] == 60
    assert sched["cleanup-stale"]["options"] == {"expires": 55}
    assert sched["cleanup-retention"]["task"] == "cleanup_retention"
    assert sched["cleanup-retention"]["schedule"] == 24 * 3600
    # eski girdiler değişmedi
    assert sched["resume-action-queues"]["task"] == "resume_action_queues"
    assert sched["expire-stale-sessions"]["task"] == "expire_stale_sessions"
    # her beat görevi kayıtlı bir göreve işaret eder
    for entry in sched.values():
        assert entry["task"] in registered
