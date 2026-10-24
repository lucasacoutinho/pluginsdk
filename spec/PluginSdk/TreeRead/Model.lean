import PluginSdk.TreeRead.Properties

namespace PluginSdk.TreeRead

def admitEntry (input : EntryInput) : EntryDecision :=
  if ¬ EntryAvailable input then .unavailable
  else if ¬ EntryRegular input then .notRegular
  else if Unsupported input.paths then .unavailable
  else if Stream input.paths then .stream
  else if ¬ EntryBound input then .changed
  else if ¬ EntryContained input then .outside
  else if ¬ ExactEntry input then .nameMismatch
  else if ¬ LinkAllowed input then .reparse
  else if ¬ CycleFree input then .cycle
  else .accepted

def admitDirectory (input : DirectoryInput) : DirectoryDecision :=
  if ¬ DirectoryAvailable input then .unavailable
  else if ¬ DirectoryRegular input then .notDirectory
  else if Unsupported input.paths then .unavailable
  else if Stream input.paths then .stream
  else if ¬ DirectoryBound input then .changed
  else if ¬ AtOrInside input.root input.directory then .outside
  else if ¬ UniqueNames input then .duplicate
  else if ¬ EnumerationsAgree input then .changed
  else if ¬ VisitsComplete input then .incomplete
  else .accepted

def model : Interface := { entry := admitEntry, directory := admitDirectory }

end PluginSdk.TreeRead
