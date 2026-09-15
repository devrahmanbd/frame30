---
name: liquid-glass-design
description: iOS 26/macOS 26 Liquid Glass design system with complete API coverage. Use when user asks about iOS 26 design, Liquid Glass, glassEffect modifier, GlassEffectContainer, morphing animations, HIG compliance, visual styling, or the new Apple design language.
allowed-tools: Bash, Read, Write, Edit
---

# Liquid Glass Design System

Comprehensive guide to iOS 26 and macOS Tahoe's revolutionary Liquid Glass design system, including complete SwiftUI API coverage, Human Interface Guidelines, morphing animations, and implementation best practices.

## Prerequisites
- Xcode 26+
- iOS 26 / macOS Tahoe deployment target
- SwiftUI framework

## Overview

Liquid Glass is Apple's new design language that creates a lightweight, dynamic material that bends light, responds to motion, adapts to content, and morphs fluidly while respecting accessibility.

**Key Principle**: Reserve glass for navigation and controls, NOT for content.

## Glass Variants

### Regular Glass (Default)
```swift
Button("Action") { performAction() }
    .buttonStyle(.glass)
```

### Clear Glass
```swift
Button("Subtle Action") { performAction() }
    .buttonStyle(.glassClear)
```

### Identity Glass (No effect)
```swift
.glassEffect(.identity)
```

> **NEVER mix Regular and Clear glass variants in the same interface.**

## API Reference

```swift
// Basic glass effect
View().glassEffect()
View().glassEffect(in: RoundedRectangle(cornerRadius: 16))
View().glassEffect(.regular, in: Capsule())

// Glass Button Styles
.buttonStyle(.glass)
.buttonStyle(.glassProminent)
.buttonStyle(.glassBorderless)

// Tint
View().glassEffect().tint(.blue)

// Interactive
.glassEffect(.regular.interactive(), in: Capsule())
```

## GlassEffectContainer

Combines multiple glass shapes into a morphable unit. The `spacing` parameter controls morphing threshold.

```swift
GlassEffectContainer(spacing: 8) {
    HStack {
        Button("A") { }.glassEffect(in: Capsule())
        Button("B") { }.glassEffect(in: Capsule())
    }
}
```

## Morphing Animations

```swift
// Link elements across states for fluid morphing
@Namespace private var animation

Button("Collapsed") { }
    .glassEffect(in: Capsule())
    .glassEffectID("button", in: animation)

// Same ID in expanded state = morph
HStack {
    Button("Edit") { }
        .glassEffect(in: Capsule())
        .glassEffectID("button", in: animation)
}
```

## Transition Types
```swift
.glassEffectTransition(.scale)
.glassEffectTransition(.opacity)
.glassEffectTransition(.slide)
.glassEffectTransition(.identity)
```

## Known Issues

**iOS 26.1**: Placing a `Menu` inside `GlassEffectContainer` breaks morphing. Move Menu outside container as workaround.

## Accessibility

Liquid Glass automatically respects:
- **Reduce Transparency**: Glass becomes more opaque
- **Increase Contrast**: Glass shifts to black/white with prominent borders
- **Reduce Motion**: Morphing animations are subdued

## Toolbar Integration

iOS 26 toolbars automatically adopt Liquid Glass:
- `ToolbarItem(placement: .primaryAction)` for glass buttons
- `ToolbarSpacer(.fixed)` for grouping related items
- `Button(role: .close)` for glass X styling
- `.toolbarBackgroundVisibility(.visible, for: .navigationBar)`

## Best Practices

**DO:**
- Use glass for navigation elements (toolbars, tab bars, floating buttons)
- Keep content behind glass (let users see through)
- Use morphing for meaningful state transitions
- Test with accessibility settings enabled

**DON'T:**
- Apply glass on content cards or text containers
- Mix regular and clear glass variants
- Nest glass elements
- Overuse morphing animations
