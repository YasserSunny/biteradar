"""Central declaration of provider-content retention decisions."""
from dataclasses import dataclass
from typing import Literal, Optional

RetentionClass = Literal["transient", "expiring", "durable", "pending_review"]


@dataclass(frozen=True)
class RetentionPolicy:
    content: RetentionClass
    identifiers: RetentionClass
    aggregates: RetentionClass
    expires_after_days: Optional[int] = None


SOURCE_RETENTION_POLICIES = {
    "google": RetentionPolicy(
        content="transient", identifiers="durable", aggregates="durable"
    ),
    "yelp": RetentionPolicy(
        content="transient", identifiers="durable", aggregates="durable"
    ),
    # Existing Foursquare rows remain untouched until contractual rights are reviewed.
    "foursquare": RetentionPolicy(
        content="pending_review", identifiers="durable", aggregates="durable"
    ),
    "biteradar": RetentionPolicy(
        content="durable", identifiers="durable", aggregates="durable"
    ),
}


def policy_for(source: str) -> RetentionPolicy:
    try:
        return SOURCE_RETENTION_POLICIES[source.lower()]
    except KeyError as error:
        raise ValueError(f"No retention policy declared for source: {source}") from error
