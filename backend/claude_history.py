"""
Claude History Parser - ADTs and parsers for Claude Code interaction history.

This module provides dataclasses representing the structure of Claude Code's
JSONL history files, along with functions to parse them.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Union
from abc import ABC, abstractmethod


# =============================================================================
# Content Block Types
# =============================================================================

@dataclass
class ContentBlock(ABC):
    """Base class for message content blocks."""

    @abstractmethod
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        pass


@dataclass
class TextContent(ContentBlock):
    """Text content block."""
    text: str

    @staticmethod
    def from_dict(d: dict) -> TextContent:
        return TextContent(text=d.get("text", ""))

    def to_dict(self) -> dict:
        return {"type": "text", "text": self.text}


@dataclass
class ThinkingContent(ContentBlock):
    """Thinking content block (extended thinking)."""
    thinking: str
    signature: str | None = None

    @staticmethod
    def from_dict(d: dict) -> ThinkingContent:
        return ThinkingContent(
            thinking=d.get("thinking", ""),
            signature=d.get("signature"),
        )

    def to_dict(self) -> dict:
        d = {"type": "thinking", "thinking": self.thinking}
        if self.signature is not None:
            d["signature"] = self.signature
        return d


@dataclass
class ToolUseContent(ContentBlock):
    """Tool use content block."""
    id: str
    name: str
    input: dict[str, Any]

    @staticmethod
    def from_dict(d: dict) -> ToolUseContent:
        return ToolUseContent(
            id=d.get("id", ""),
            name=d.get("name", ""),
            input=d.get("input", {}),
        )

    def to_dict(self) -> dict:
        return {
            "type": "tool_use",
            "id": self.id,
            "name": self.name,
            "input": self.input,
        }


@dataclass
class ToolResultContent(ContentBlock):
    """Tool result content block."""
    tool_use_id: str
    content: str | list[dict]
    is_error: bool = False

    @staticmethod
    def from_dict(d: dict) -> ToolResultContent:
        return ToolResultContent(
            tool_use_id=d.get("tool_use_id", ""),
            content=d.get("content", ""),
            is_error=d.get("is_error", False),
        )

    def to_dict(self) -> dict:
        d = {
            "type": "tool_result",
            "tool_use_id": self.tool_use_id,
            "content": self.content,
        }
        if self.is_error:
            d["is_error"] = self.is_error
        return d


def parse_content_block(d: dict) -> ContentBlock:
    """Parse a content block from a dictionary."""
    block_type = d.get("type", "")
    if block_type == "text":
        return TextContent.from_dict(d)
    elif block_type == "thinking":
        return ThinkingContent.from_dict(d)
    elif block_type == "tool_use":
        return ToolUseContent.from_dict(d)
    elif block_type == "tool_result":
        return ToolResultContent.from_dict(d)
    else:
        # Return as text content with the raw dict as string
        return TextContent(text=str(d))


def parse_content(content: str | list) -> list[ContentBlock]:
    """Parse message content which can be a string or list of content blocks."""
    if isinstance(content, str):
        return [TextContent(text=content)]
    elif isinstance(content, list):
        return [parse_content_block(item) if isinstance(item, dict) else TextContent(text=str(item))
                for item in content]
    else:
        return [TextContent(text=str(content))]


def serialize_content(blocks: list[ContentBlock], original_content: Any = None) -> str | list[dict]:
    """
    Serialize content blocks back to the original format.
    If original_content was a string, return a string; otherwise return list of dicts.
    """
    if original_content is not None and isinstance(original_content, str):
        # Original was a string, return as string
        if len(blocks) == 1 and isinstance(blocks[0], TextContent):
            return blocks[0].text
        # Fallback: concatenate text contents
        return "".join(b.text for b in blocks if isinstance(b, TextContent))
    else:
        # Return as list of dicts
        return [block.to_dict() for block in blocks]


# =============================================================================
# Message Types (inside entries)
# =============================================================================

@dataclass
class Usage:
    """API usage statistics."""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_creation_input_tokens: int = 0
    cache_read_input_tokens: int = 0
    service_tier: str = ""
    # Store raw for perfect round-trip
    _raw: dict | None = field(default=None, repr=False)

    @staticmethod
    def from_dict(d: dict | None) -> Usage:
        if d is None:
            return Usage()
        return Usage(
            input_tokens=d.get("input_tokens", 0),
            output_tokens=d.get("output_tokens", 0),
            cache_creation_input_tokens=d.get("cache_creation_input_tokens", 0),
            cache_read_input_tokens=d.get("cache_read_input_tokens", 0),
            service_tier=d.get("service_tier", ""),
            _raw=d,
        )

    def to_dict(self) -> dict:
        if self._raw is not None:
            return self._raw
        d = {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cache_creation_input_tokens": self.cache_creation_input_tokens,
            "cache_read_input_tokens": self.cache_read_input_tokens,
        }
        if self.service_tier:
            d["service_tier"] = self.service_tier
        return d


@dataclass
class Message(ABC):
    """Base class for messages."""
    role: str
    content: list[ContentBlock] = field(default_factory=list)
    # Store raw for perfect round-trip
    _raw: dict | None = field(default=None, repr=False)

    @abstractmethod
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        pass


@dataclass
class UserMessage(Message):
    """User message."""

    @staticmethod
    def from_dict(d: dict) -> UserMessage:
        content = parse_content(d.get("content", ""))
        return UserMessage(role=d.get("role", "user"), content=content, _raw=d)

    def to_dict(self) -> dict:
        if self._raw is not None:
            return self._raw
        return {
            "role": self.role,
            "content": serialize_content(self.content),
        }


@dataclass
class AssistantMessage(Message):
    """Assistant message with model info and usage."""
    model: str = ""
    message_id: str = ""
    stop_reason: str | None = None
    stop_sequence: str | None = None
    usage: Usage = field(default_factory=Usage)

    @staticmethod
    def from_dict(d: dict) -> AssistantMessage:
        content = parse_content(d.get("content", []))
        return AssistantMessage(
            role=d.get("role", "assistant"),
            content=content,
            model=d.get("model", ""),
            message_id=d.get("id", ""),
            stop_reason=d.get("stop_reason"),
            stop_sequence=d.get("stop_sequence"),
            usage=Usage.from_dict(d.get("usage")),
            _raw=d,
        )

    def to_dict(self) -> dict:
        if self._raw is not None:
            return self._raw
        d = {
            "role": self.role,
            "content": serialize_content(self.content),
        }
        if self.model:
            d["model"] = self.model
        if self.message_id:
            d["id"] = self.message_id
        d["type"] = "message"
        d["stop_reason"] = self.stop_reason
        d["stop_sequence"] = self.stop_sequence
        d["usage"] = self.usage.to_dict()
        return d


# =============================================================================
# Entry Types (top-level JSONL entries)
# =============================================================================

@dataclass
class Entry(ABC):
    """Base class for JSONL entries."""
    uuid: str
    timestamp: datetime
    entry_type: str
    raw: dict = field(repr=False)

    @property
    def parent_uuid(self) -> str | None:
        return self.raw.get("parentUuid")

    @property
    def session_id(self) -> str | None:
        return self.raw.get("sessionId")

    @property
    def cwd(self) -> str | None:
        return self.raw.get("cwd")

    @property
    def version(self) -> str | None:
        return self.raw.get("version")

    @property
    def git_branch(self) -> str | None:
        return self.raw.get("gitBranch")

    @property
    def agent_id(self) -> str | None:
        return self.raw.get("agentId")

    @property
    def is_sidechain(self) -> bool:
        return self.raw.get("isSidechain", False)

    def to_dict(self) -> dict:
        """
        Serialize entry back to dictionary.
        Returns the original raw dict for perfect round-trip serialization.
        """
        return self.raw


@dataclass
class UserEntry(Entry):
    """User message entry."""
    message: UserMessage
    user_type: str = "external"

    @staticmethod
    def from_dict(d: dict) -> UserEntry:
        msg_dict = d.get("message", {})
        return UserEntry(
            uuid=d.get("uuid", ""),
            timestamp=_parse_timestamp(d.get("timestamp", "")),
            entry_type="user",
            raw=d,
            message=UserMessage.from_dict(msg_dict),
            user_type=d.get("userType", "external"),
        )


@dataclass
class AssistantEntry(Entry):
    """Assistant response entry."""
    message: AssistantMessage
    request_id: str = ""

    @staticmethod
    def from_dict(d: dict) -> AssistantEntry:
        msg_dict = d.get("message", {})
        return AssistantEntry(
            uuid=d.get("uuid", ""),
            timestamp=_parse_timestamp(d.get("timestamp", "")),
            entry_type="assistant",
            raw=d,
            message=AssistantMessage.from_dict(msg_dict),
            request_id=d.get("requestId", ""),
        )


@dataclass
class SystemEntry(Entry):
    """System message entry."""
    subtype: str
    content: str
    level: str = "info"
    is_meta: bool = False

    @staticmethod
    def from_dict(d: dict) -> SystemEntry:
        return SystemEntry(
            uuid=d.get("uuid", ""),
            timestamp=_parse_timestamp(d.get("timestamp", "")),
            entry_type="system",
            raw=d,
            subtype=d.get("subtype", ""),
            content=d.get("content", ""),
            level=d.get("level", "info"),
            is_meta=d.get("isMeta", False),
        )


@dataclass
class FileHistorySnapshotEntry(Entry):
    """File history snapshot entry."""
    message_id: str
    snapshot: dict
    is_snapshot_update: bool = False

    @staticmethod
    def from_dict(d: dict) -> FileHistorySnapshotEntry:
        return FileHistorySnapshotEntry(
            uuid=d.get("messageId", d.get("uuid", "")),
            timestamp=_parse_timestamp(d.get("snapshot", {}).get("timestamp", "")),
            entry_type="file-history-snapshot",
            raw=d,
            message_id=d.get("messageId", ""),
            snapshot=d.get("snapshot", {}),
            is_snapshot_update=d.get("isSnapshotUpdate", False),
        )


@dataclass
class SummaryEntry(Entry):
    """Session summary entry."""
    summary: str
    leaf_uuid: str

    @staticmethod
    def from_dict(d: dict) -> SummaryEntry:
        return SummaryEntry(
            uuid=d.get("leafUuid", ""),
            timestamp=datetime.now(),  # Summary entries don't have timestamp
            entry_type="summary",
            raw=d,
            summary=d.get("summary", ""),
            leaf_uuid=d.get("leafUuid", ""),
        )


@dataclass
class QueueOperationEntry(Entry):
    """Queue operation entry."""
    operation: str
    content: str = ""

    @staticmethod
    def from_dict(d: dict) -> QueueOperationEntry:
        return QueueOperationEntry(
            uuid="",
            timestamp=_parse_timestamp(d.get("timestamp", "")),
            entry_type="queue-operation",
            raw=d,
            operation=d.get("operation", ""),
            content=d.get("content", ""),
        )


def _parse_timestamp(ts: str) -> datetime:
    """Parse ISO timestamp string to datetime."""
    if not ts:
        return datetime.now()
    try:
        # Handle various ISO formats
        ts = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(ts)
    except ValueError:
        return datetime.now()


def parse_entry(d: dict) -> Entry:
    """Parse a dictionary into the appropriate Entry type."""
    entry_type = d.get("type", "")

    if entry_type == "user":
        return UserEntry.from_dict(d)
    elif entry_type == "assistant":
        return AssistantEntry.from_dict(d)
    elif entry_type == "system":
        return SystemEntry.from_dict(d)
    elif entry_type == "file-history-snapshot":
        return FileHistorySnapshotEntry.from_dict(d)
    elif entry_type == "summary":
        return SummaryEntry.from_dict(d)
    elif entry_type == "queue-operation":
        return QueueOperationEntry.from_dict(d)
    else:
        # Unknown type - create a generic entry
        @dataclass
        class UnknownEntry(Entry):
            pass
        return UnknownEntry(
            uuid=d.get("uuid", ""),
            timestamp=_parse_timestamp(d.get("timestamp", "")),
            entry_type=entry_type,
            raw=d,
        )


def serialize_entry(entry: Entry) -> str:
    """Serialize an entry to a JSON string (one line of JSONL)."""
    return json.dumps(entry.to_dict(), ensure_ascii=False)


# =============================================================================
# Interaction Types
# =============================================================================

@dataclass
class Action:
    """An action taken by Claude during an interaction."""
    action_type: str  # 'thinking', 'tool_use', 'text', 'auto_compact'
    timestamp: datetime | None = None
    # For thinking
    thinking: str | None = None
    # For tool_use (includes result when available)
    tool_name: str | None = None
    tool_id: str | None = None
    tool_input: dict[str, Any] | None = None
    tool_result: str | None = None  # Result of the tool call
    is_error: bool = False  # Whether the tool call resulted in error
    # For text (intermediate responses)
    text: str | None = None
    # For auto_compact (context continuation summary)
    summary: str | None = None


@dataclass
class Interaction:
    """A single interaction: user prompt -> Claude actions -> final response."""
    id: str
    timestamp: datetime
    user_prompt: str
    actions: list[Action] = field(default_factory=list)
    final_response: str | None = None
    model: str | None = None
    cancel_reason: str | None = None  # Reason if user cancelled this interaction


# =============================================================================
# Interaction Building Functions
# =============================================================================

def _is_local_command_message(text: str) -> bool:
    """Check if the text is a local command message that should be ignored."""
    if text.startswith("Caveat: The messages below were generated by the user while running local commands"):
        return True
    if "<command-name>" in text or "<command-message>" in text:
        return True
    if "<local-command-stdout>" in text or "<local-command-stderr>" in text:
        return True
    return False


AUTO_COMPACT_PREFIX = "This session is being continued from a previous conversation that ran out of context."

CANCELLATION_MESSAGES = {
    "[Request interrupted by user for tool use]",
    "[Request interrupted by user]",
}


def _is_auto_compact_message(text: str) -> bool:
    """Check if the text is an auto-compact continuation message."""
    return text.strip().startswith(AUTO_COMPACT_PREFIX)


def _is_cancellation_message(text: str) -> bool:
    """Check if the text is a user cancellation message."""
    return text.strip() in CANCELLATION_MESSAGES


def _is_human_message(entry: Entry) -> bool:
    """Check if an entry is a human-written message (not a tool result, local command, auto-compact, or cancellation)."""
    if not isinstance(entry, UserEntry):
        return False
    # Check if any content block is a tool result
    for block in entry.message.content:
        if isinstance(block, ToolResultContent):
            return False
    # Check if it's a local command message, auto-compact, or cancellation
    text = ""
    for block in entry.message.content:
        if isinstance(block, TextContent):
            text += block.text
    if _is_local_command_message(text):
        return False
    if _is_auto_compact_message(text):
        return False
    if _is_cancellation_message(text):
        return False
    return True


def _get_text_content(entry: UserEntry) -> str:
    """Extract text content from a user entry."""
    texts = []
    for block in entry.message.content:
        if isinstance(block, TextContent):
            texts.append(block.text)
    return "\n".join(texts)


def _extract_actions_from_assistant(entry: AssistantEntry) -> tuple[list[Action], str | None, bool]:
    """
    Extract actions from an assistant entry.
    Returns: (actions, final_text, has_tool_use)
    - Thinking content is added as actions, NOT included in final_text
    """
    actions = []
    text_parts = []
    has_tool_use = False
    timestamp = entry.timestamp

    for block in entry.message.content:
        # Check for thinking content (including any block with a thinking attribute)
        if isinstance(block, ThinkingContent) or hasattr(block, 'thinking'):
            thinking_text = block.thinking if hasattr(block, 'thinking') else str(block)
            actions.append(Action(
                action_type="thinking",
                timestamp=timestamp,
                thinking=thinking_text,
            ))
        elif isinstance(block, ToolUseContent):
            has_tool_use = True
            actions.append(Action(
                action_type="tool_use",
                timestamp=timestamp,
                tool_name=block.name,
                tool_id=block.id,
                tool_input=block.input,
            ))
        elif isinstance(block, TextContent):
            # Skip if the text looks like a stringified thinking block (fallback case)
            text = block.text
            if text.startswith("{'type': 'thinking'") or text.startswith('{"type": "thinking"'):
                continue
            text_parts.append(text)

    final_text = "\n".join(text_parts) if text_parts else None
    return actions, final_text, has_tool_use


def _extract_tool_results(entry: UserEntry) -> dict[str, tuple[str, bool]]:
    """
    Extract tool results from a user entry (tool result message).
    Returns: dict mapping tool_use_id -> (result_content, is_error)
    """
    results: dict[str, tuple[str, bool]] = {}

    for block in entry.message.content:
        if isinstance(block, ToolResultContent):
            content_str = block.content if isinstance(block.content, str) else json.dumps(block.content)
            results[block.tool_use_id] = (content_str, block.is_error)

    return results


def build_interactions(entries: list[Entry]) -> list[Interaction]:
    """
    Group entries into interactions.

    An interaction starts with a human message and includes all subsequent
    Claude actions until either:
    - Another human message arrives
    - Claude gives a final response (text without tool calls)
    - The session ends
    """
    interactions: list[Interaction] = []
    current_interaction: Interaction | None = None
    interaction_counter = 0

    def _find_tool_use_action(tool_id: str) -> Action | None:
        """Find a tool_use action by its ID in the current interaction."""
        if current_interaction is None:
            return None
        for action in current_interaction.actions:
            if action.action_type == "tool_use" and action.tool_id == tool_id:
                return action
        return None

    for entry in entries:
        # Skip system entries and other non-message entries
        if isinstance(entry, SystemEntry) or isinstance(entry, SummaryEntry):
            continue

        # Human message starts a new interaction
        if _is_human_message(entry):
            # Save previous interaction if exists
            if current_interaction is not None:
                interactions.append(current_interaction)

            interaction_counter += 1
            user_text = _get_text_content(entry)  # type: ignore
            timestamp = entry.timestamp

            current_interaction = Interaction(
                id=f"interaction-{interaction_counter}",
                timestamp=timestamp,
                user_prompt=user_text,
                actions=[],
                final_response=None,
                model=None,
            )

        # Tool result, auto-compact, or cancellation (user entry that's not a human message)
        elif isinstance(entry, UserEntry):
            if current_interaction is not None:
                text = _get_text_content(entry)
                # Check for cancellation message
                if _is_cancellation_message(text):
                    current_interaction.cancel_reason = text.strip()
                # Check for auto-compact message
                elif _is_auto_compact_message(text):
                    current_interaction.actions.append(Action(
                        action_type="auto_compact",
                        timestamp=entry.timestamp,
                        summary=text,
                    ))
                else:
                    # Tool results
                    tool_results = _extract_tool_results(entry)
                    # Match results to their corresponding tool_use actions
                    for tool_id, (result_content, is_error) in tool_results.items():
                        tool_action = _find_tool_use_action(tool_id)
                        if tool_action is not None:
                            tool_action.tool_result = result_content
                            tool_action.is_error = is_error

        # Assistant response
        elif isinstance(entry, AssistantEntry):
            if current_interaction is not None:
                actions, text, has_tool_use = _extract_actions_from_assistant(entry)
                current_interaction.actions.extend(actions)

                # Set model from first assistant response
                if current_interaction.model is None and entry.message.model:
                    current_interaction.model = entry.message.model

                # Always add text as an action to preserve ordering for interleaved display
                if text:
                    current_interaction.actions.append(Action(
                        action_type="text",
                        timestamp=entry.timestamp,
                        text=text,
                    ))
                    # Also track as final_response for backward compatibility
                    if current_interaction.final_response:
                        current_interaction.final_response += "\n" + text
                    else:
                        current_interaction.final_response = text

    # Don't forget the last interaction
    if current_interaction is not None:
        interactions.append(current_interaction)

    return interactions


# =============================================================================
# Session and History Containers
# =============================================================================

@dataclass
class Session:
    """A collection of entries from a single session file."""
    file_path: Path
    entries: list[Entry]
    session_id: str = ""

    def __post_init__(self):
        # Try to extract session_id from first entry with one
        for entry in self.entries:
            if entry.session_id:
                self.session_id = entry.session_id
                break

    @property
    def user_entries(self) -> list[UserEntry]:
        return [e for e in self.entries if isinstance(e, UserEntry)]

    @property
    def assistant_entries(self) -> list[AssistantEntry]:
        return [e for e in self.entries if isinstance(e, AssistantEntry)]

    @property
    def system_entries(self) -> list[SystemEntry]:
        return [e for e in self.entries if isinstance(e, SystemEntry)]

    @property
    def summaries(self) -> list[SummaryEntry]:
        return [e for e in self.entries if isinstance(e, SummaryEntry)]

    @property
    def interactions(self) -> list[Interaction]:
        """Get interactions from this session."""
        return build_interactions(self.entries)

    @property
    def is_agent(self) -> bool:
        """Check if this is an agent session (filename starts with 'agent-')."""
        return self.file_path.stem.startswith("agent-")

    def get_conversations(self) -> list[list[Entry]]:
        """
        Extract conversation threads by following parent_uuid links.
        Returns list of conversations, each as a list of entries.
        """
        # Build a map from uuid to entry
        uuid_to_entry: dict[str, Entry] = {}
        for entry in self.entries:
            if entry.uuid:
                uuid_to_entry[entry.uuid] = entry

        # Find roots (entries with no parent or parent not in session)
        roots = [e for e in self.entries
                 if not e.parent_uuid or e.parent_uuid not in uuid_to_entry]

        # Build children map
        children: dict[str, list[Entry]] = {}
        for entry in self.entries:
            if entry.parent_uuid and entry.parent_uuid in uuid_to_entry:
                if entry.parent_uuid not in children:
                    children[entry.parent_uuid] = []
                children[entry.parent_uuid].append(entry)

        # Extract conversation threads (DFS from roots)
        conversations = []
        for root in roots:
            if isinstance(root, (UserEntry, AssistantEntry)):
                thread = []
                stack = [root]
                while stack:
                    entry = stack.pop()
                    thread.append(entry)
                    if entry.uuid in children:
                        stack.extend(reversed(children[entry.uuid]))
                if thread:
                    conversations.append(thread)

        return conversations

    def to_jsonl(self) -> str:
        """Serialize all entries to JSONL format."""
        lines = [serialize_entry(entry) for entry in self.entries]
        return "\n".join(lines)

    def write_jsonl(self, file_path: Path | str | None = None) -> None:
        """Write entries to a JSONL file."""
        if file_path is None:
            file_path = self.file_path
        file_path = Path(file_path)
        with open(file_path, "w", encoding="utf-8") as f:
            for entry in self.entries:
                f.write(serialize_entry(entry))
                f.write("\n")


@dataclass
class ClaudeHistory:
    """The complete Claude Code history from a directory."""
    root_path: Path
    sessions: list[Session]
    sources: dict[str, list[Session]] = field(default_factory=dict)

    @property
    def all_entries(self) -> list[Entry]:
        return [entry for session in self.sessions for entry in session.entries]

    @property
    def all_user_entries(self) -> list[UserEntry]:
        return [e for e in self.all_entries if isinstance(e, UserEntry)]

    @property
    def all_assistant_entries(self) -> list[AssistantEntry]:
        return [e for e in self.all_entries if isinstance(e, AssistantEntry)]

    @property
    def regular_sessions(self) -> list[Session]:
        """Sessions that are not agent sessions."""
        return [s for s in self.sessions if not s.is_agent]

    @property
    def agent_sessions(self) -> list[Session]:
        """Agent sessions only."""
        return [s for s in self.sessions if s.is_agent]

    def sessions_by_source(self, source: str) -> list[Session]:
        """Get sessions from a specific source (subdirectory)."""
        return self.sources.get(source, [])


# =============================================================================
# Parsing Functions
# =============================================================================

def parse_session_file(file_path: Path | str) -> Session:
    """Parse a single JSONL session file into a Session object."""
    file_path = Path(file_path)
    entries = []

    with open(file_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                entry = parse_entry(d)
                entries.append(entry)
            except json.JSONDecodeError as e:
                # Skip malformed lines but could log a warning
                pass

    return Session(file_path=file_path, entries=entries)


def load_claude_history(root_path: Path | str) -> ClaudeHistory:
    """
    Load the complete Claude Code history from a directory.

    The directory structure is expected to be:
    root_path/
        source1/
            session1.jsonl
            agent-xxx.jsonl
        source2/
            ...
    """
    root_path = Path(root_path)
    all_sessions = []
    sources: dict[str, list[Session]] = {}

    for subdir in sorted(root_path.iterdir()):
        if subdir.is_dir():
            source_name = subdir.name
            source_sessions = []

            for file_path in sorted(subdir.glob("*.jsonl")):
                session = parse_session_file(file_path)
                source_sessions.append(session)
                all_sessions.append(session)

            sources[source_name] = source_sessions

    return ClaudeHistory(
        root_path=root_path,
        sessions=all_sessions,
        sources=sources,
    )


# =============================================================================
# Round-trip verification
# =============================================================================

def verify_roundtrip(file_path: Path | str) -> tuple[bool, list[int]]:
    """
    Verify that parsing and serializing a JSONL file produces identical output.

    Returns:
        (success, mismatched_lines): A tuple of success boolean and list of
        line numbers (1-indexed) where mismatches occurred.
    """
    file_path = Path(file_path)
    mismatched = []

    with open(file_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                original = json.loads(line)
                entry = parse_entry(original)
                serialized = entry.to_dict()

                if original != serialized:
                    mismatched.append(line_num)
            except json.JSONDecodeError:
                # Skip malformed lines
                pass

    return (len(mismatched) == 0, mismatched)


def verify_all_roundtrips(root_path: Path | str) -> dict[str, tuple[bool, list[int]]]:
    """
    Verify round-trip serialization for all JSONL files in a directory.

    Returns:
        Dictionary mapping file paths to (success, mismatched_lines) tuples.
    """
    root_path = Path(root_path)
    results = {}

    for subdir in sorted(root_path.iterdir()):
        if subdir.is_dir():
            for file_path in sorted(subdir.glob("*.jsonl")):
                results[str(file_path)] = verify_roundtrip(file_path)

    return results
