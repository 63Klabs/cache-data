# Clarifying Questions

## Q1: HTML and RSS Body Formatting Differences

The HTML Body_Formatter uses a `title` and `body` parameter pattern (e.g., `html("404 Not Found", "<p>Not Found</p>")`), while other formats use a single message string. Should the centralized module support both patterns, or should the HTML format's Body_Formatter handle the title/body split internally?

**Proposed approach:** The Status_Code_Map provides a single message string per status code. Each format's Body_Formatter is responsible for transforming that message into the appropriate body. The HTML Body_Formatter will internally construct the title (e.g., `"404 Not Found"`) from the status code and message, matching the current output exactly.

## Q2: RSS and XML Teapot Message Inconsistency

The RSS and XML formats prefix the 418 message with the status code (`"418 I'm a teapot"`), while HTML, JSON, and Text use just `"I'm a teapot"`. Should the centralized module normalize this, or preserve the existing per-format behavior?

**Proposed approach:** Preserve the existing behavior exactly. The Body_Formatter for RSS and XML will handle the 418 special case to maintain backwards compatibility.

## Q3: JSON `json()` Helper Function Behavior

The JSON format exports a `json(data)` helper that returns `data || {}`. This helper is unrelated to the response generation logic. Should it remain as a standalone export on the JSON Format_File, or be moved into the centralized module?

**Proposed approach:** Keep it as a standalone export on the JSON Format_File since it is format-specific and not part of the shared response pattern.
