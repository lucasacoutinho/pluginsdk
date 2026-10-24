import PluginSdk.FileRead.Properties

namespace PluginSdk.FileRead

def admit (input : ReadInput) : ReadDecision :=
  if ¬ Available input then .unavailable
  else if ¬ RegularFiles input then .notRegular
  else if UnsupportedPath input then .unavailable
  else if StreamPath input then .stream
  else if ¬ RootBound input then .changed
  else if ¬ FilesContained input then .outside
  else if ¬ StableRead input then .changed
  else .accepted

def model : Interface := {
  parsePath := parsePath
  inside := fun root file => decide (Contained root file)
  admit := admit
}

end PluginSdk.FileRead
