# @toolpath/part-contracts

What a part report is once it has left the Toolpath API and before any
application has an opinion about it: the redacted report shape the browser is
allowed to see, the analysis event stream, which CAD files are accepted, and the
pure logic for reading features, directions and selections out of a report.

Both sides of an application use this. The server redacts an Engine report into
`PublicInspectionReport`; the browser reads the same type back. Keeping one
definition is what stops the two drifting.

Nothing here touches the network, the filesystem, React, or an API key. Feature
selection lives here rather than in an application because the DFM app and the
tool catalog have to agree on what "these three features, cut from this
direction" means — a shop that selects differently in two places is being shown
two different parts.
