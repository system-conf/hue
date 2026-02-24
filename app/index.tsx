import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Dimensions, Vibration, Text, Platform } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useDerivedValue,
    interpolateColor,
    withTiming,
    withSequence,
    withRepeat,
    runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Notification configuration
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

// Color constants
const COLOR_EMPTY = '#121212';
const COLOR_START = '#2ecc71';
const COLOR_MID = '#f1c40f';
const COLOR_END = '#e74c3c';

export default function HueTimer() {
    const [isActive, setIsActive] = useState(false);

    // Core state
    const duration = useSharedValue(0);
    const timeLeft = useSharedValue(0);
    const isSetting = useSharedValue(false);
    const flashOpacity = useSharedValue(0);
    const pulseOpacity = useSharedValue(0.05);

    // This state will only update at most once per second to save performance
    const [displayMinutes, setDisplayMinutes] = useState('00');
    const [displaySeconds, setDisplaySeconds] = useState('00');

    const notificationId = useRef<string | null>(null);
    const lastUpdateRef = useRef(0);

    // Notification permissions with safety for Expo Go
    useEffect(() => {
        const requestPermissions = async () => {
            try {
                const { status: existingStatus } = await Notifications.getPermissionsAsync();
                if (existingStatus !== 'granted') {
                    await Notifications.requestPermissionsAsync();
                }
            } catch (error) {
                console.log('Notification permission error (often expected in Expo Go Android):', error);
            }
        };
        requestPermissions();

        if (Platform.OS === 'android') {
            try {
                Notifications.setNotificationChannelAsync('hue-timer', {
                    name: 'Hue Timer',
                    importance: Notifications.AndroidImportance.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#e74c3c',
                });
            } catch (error) {
                console.log('Channel setup error:', error);
            }
        }
    }, []);

    // Optimized Clock Display Logic
    // We only call runOnJS when the actual numbers change
    useDerivedValue(() => {
        const totalSecs = Math.floor(timeLeft.value);
        if (totalSecs !== lastUpdateRef.current) {
            lastUpdateRef.current = totalSecs;
            const m = Math.floor(totalSecs / 60);
            const s = totalSecs % 60;
            const mStr = m.toString().padStart(2, '0');
            const sStr = s.toString().padStart(2, '0');
            runOnJS(setDisplayMinutes)(mStr);
            runOnJS(setDisplaySeconds)(sStr);
        }
    });

    // Precise Timer Logic
    const timerStartRef = useRef<number | null>(null);
    const initialTimeLeftRef = useRef(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isActive && timeLeft.value > 0) {
            timerStartRef.current = Date.now();
            initialTimeLeftRef.current = timeLeft.value;

            interval = setInterval(() => {
                const elapsed = (Date.now() - (timerStartRef.current || 0)) / 1000;
                const newTime = Math.max(0, initialTimeLeftRef.current - elapsed);
                timeLeft.value = newTime;

                if (newTime <= 0) {
                    setIsActive(false);
                    runOnJS(onTimerComplete)();
                }
            }, 100); // Check every 100ms for precision, but UI only updates on second change
        }

        return () => clearInterval(interval);
    }, [isActive]);

    // Pulse animation logic
    useEffect(() => {
        if (isActive) {
            pulseOpacity.value = withRepeat(
                withTiming(0.2, { duration: 1000 }),
                -1,
                true
            );
        } else {
            pulseOpacity.value = withTiming(0.05);
        }
    }, [isActive]);

    const onTimerComplete = async () => {
        flashOpacity.value = withSequence(
            withRepeat(withTiming(1, { duration: 200 }), 6, true),
            withTiming(0, { duration: 500 })
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate([0, 500, 200, 500]);
        notificationId.current = null;
    };

    const scheduleNotification = async (seconds: number) => {
        try {
            if (notificationId.current) {
                await Notifications.cancelScheduledNotificationAsync(notificationId.current);
            }

            if (seconds > 0) {
                notificationId.current = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: "Time's Up! 🎨",
                        body: "Hue timer has completed.",
                        sound: true,
                        priority: Notifications.AndroidNotificationPriority.MAX,
                    },
                    trigger: {
                        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                        seconds: Math.max(1, Math.floor(seconds)),
                    },
                });
            }
        } catch (error) {
            console.warn('Could not schedule local notification in Expo Go (Android limit):', error);
        }
    };

    const cancelNotification = async () => {
        if (notificationId.current) {
            await Notifications.cancelScheduledNotificationAsync(notificationId.current);
            notificationId.current = null;
        }
    };

    const toggleTimer = useCallback(() => {
        if (timeLeft.value > 0) {
            if (!isActive) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                scheduleNotification(timeLeft.value);
            } else {
                cancelNotification();
            }
            setIsActive(!isActive);
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }, [isActive]);

    const resetTimer = useCallback(() => {
        setIsActive(false);
        timeLeft.value = withTiming(0);
        duration.value = 0;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        cancelNotification();
    }, []);

    // Gestures
    const tapGesture = Gesture.Tap().onEnd(() => runOnJS(toggleTimer)());
    const longPressGesture = Gesture.LongPress().onEnd(() => runOnJS(resetTimer)());

    const panGesture = Gesture.Pan()
        .onBegin(() => {
            isSetting.value = true;
            runOnJS(setIsActive)(false);
            runOnJS(cancelNotification)();
        })
        .onUpdate((event) => {
            const delta = -event.translationY * 2;
            let newTime = Math.max(0, Math.min(3600, duration.value + delta));
            // Floor for logic, but keep it smooth on UI
            timeLeft.value = newTime;

            const oldMins = Math.floor(duration.value / 60);
            const newMins = Math.floor(timeLeft.value / 60);
            if (oldMins !== newMins) runOnJS(Haptics.selectionAsync)();
        })
        .onEnd(() => {
            duration.value = timeLeft.value;
            isSetting.value = false;
        });

    const composedGesture = Gesture.Exclusive(panGesture, longPressGesture, tapGesture);

    // Animated Styles
    const animatedBgStyle = useAnimatedStyle(() => {
        const backgroundColor = interpolateColor(
            timeLeft.value,
            [0, 600, 1800, 3600],
            [COLOR_EMPTY, COLOR_START, COLOR_MID, COLOR_END]
        );
        return { backgroundColor };
    });

    const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));
    const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

    const hintStyle = useAnimatedStyle(() => {
        const opacity = withTiming(timeLeft.value === 0 ? 0.4 : 0, { duration: 300 });
        return { opacity };
    });

    const clockStyle = useAnimatedStyle(() => {
        const opacity = withTiming(timeLeft.value > 0 ? 1 : 0, { duration: 300 });
        return { opacity };
    });

    const titleStyle = useAnimatedStyle(() => {
        const opacity = withTiming(timeLeft.value === 0 ? 0.8 : 0.2, { duration: 300 });
        return { opacity };
    });

    return (
        <View style={styles.container}>
            <GestureDetector gesture={composedGesture}>
                <Animated.View style={[styles.fullScreen, animatedBgStyle]}>
                    <Animated.View style={[styles.pulse, pulseStyle]} />

                    {/* App Name & Safe Area handled by top padding */}
                    <Animated.Text style={[styles.appName, titleStyle, { top: 40 + Constants.statusBarHeight }]}>
                        HUE
                    </Animated.Text>

                    {/* Time Counter */}
                    <Animated.View style={[styles.clockContainer, clockStyle]}>
                        <Text style={styles.clockText}>
                            {displayMinutes}:{displaySeconds}
                        </Text>
                    </Animated.View>

                    {/* Empty State Hint */}
                    <Animated.View style={[styles.hintContainer, hintStyle]}>
                        <Text style={styles.hintText}>Swipe up to set time</Text>
                    </Animated.View>
                </Animated.View>
            </GestureDetector>

            <Animated.View
                style={[styles.flashLayer, flashStyle, { pointerEvents: 'none' }]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    fullScreen: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    appName: {
        position: 'absolute',
        color: '#fff',
        fontSize: 24,
        fontWeight: '200',
        letterSpacing: 10,
    },
    clockContainer: {
        position: 'absolute',
    },
    clockText: {
        color: '#fff',
        fontSize: 84,
        fontWeight: '200',
        fontVariant: ['tabular-nums'],
    },
    hintContainer: {
        alignItems: 'center',
        marginTop: 180,
    },
    hintText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '300',
        letterSpacing: 2,
        textAlign: 'center',
        textTransform: 'uppercase',
    },
    flashLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#fff',
    },
    pulse: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#fff',
    }
});
