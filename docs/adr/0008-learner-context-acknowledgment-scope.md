# Learner Context acknowledgment belongs to the Learner Context revision

Status: accepted

When Learner Context is `UNSPECIFIED`, the Teacher acknowledges that missing context once for the current Learner Context revision during Course design. The acknowledgment is authority owned by Learner Context, not by each Quiz or Assignment; every Activity using that same learner-context revision inherits it. Outcome/CLO-only Core Context revisions do not invalidate the acknowledgment, while an actual Learner Context change creates new authority and requires a new explicit acknowledgment. This preserves explicit Teacher consent without repeating the same consent for every Activity or allowing Generate to imply consent.


The acknowledgment control is surfaced during Course Structure review but does not block Structure review or sealing, because a structure-only course does not consume Activity-generation authority. If the Teacher enters Activity Creation without acknowledging an UNSPECIFIED Learner Context, the same course-level control remains available there and all Generate actions remain blocked until the current Learner Context revision is explicitly acknowledged.
