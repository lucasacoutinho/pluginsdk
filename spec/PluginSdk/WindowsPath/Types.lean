import PluginSdk.Domain

namespace PluginSdk.WindowsPath

structure Capacity where
  maxComponentUnits : Nat
  remainingPathUnits : Nat
  deriving DecidableEq, Repr

structure Input where
  path : PluginSdk.PackagePath
  capacity : Capacity
  deriving DecidableEq

structure RootView where
  root : String
  maxPathBufferUnits : Nat
  deriving DecidableEq, Repr

structure RootInput where
  maxComponentUnits : Nat
  head : RootView
  tail : List RootView
  deriving DecidableEq, Repr

def RootInput.views (input : RootInput) : List RootView := input.head :: input.tail

inductive RootResolution where
  | available (capacity : Capacity)
  | refused
  deriving DecidableEq, Repr

inductive Decision where
  | accepted
  | syntax
  | device
  | componentLimit
  | pathLimit
  deriving DecidableEq, Repr

structure NativePathInput where
  platform : String
  expected : String
  reported : String
  deriving DecidableEq, Repr

structure Interface where
  classify : Input → Decision
  rootCapacity : RootInput → RootResolution
  matchesNativePath : NativePathInput → Bool

end PluginSdk.WindowsPath
