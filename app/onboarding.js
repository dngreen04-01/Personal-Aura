import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../lib/theme';
import { generatePlan, sendElicitationMessage, generateMultiModalityPlan } from '../lib/api';
import { saveUserProfile, saveWorkoutPlan, saveLocation } from '../lib/database';

const GOALS = [
  { id: 'build_muscle', label: 'Build Muscle', icon: 'fitness-center' },
  { id: 'lose_fat', label: 'Lose Fat', icon: 'adjust' },
  { id: 'increase_strength', label: 'Increase Strength', icon: 'fitness-center' },
];

const EQUIPMENT = [
  { id: 'commercial_gym', label: 'Full Gym' },
  { id: 'home_gym', label: 'Dumbbells Only' },
  { id: 'bodyweight_only', label: 'Bodyweight' },
];

const GENDERS = ['Male', 'Female', 'Non-binary'];

function getAssessmentExercises(equipment) {
  let lowerBody;
  if (equipment === 'commercial_gym') {
    lowerBody = [
      { name: 'Machine Leg Press', unit: 'kg' },
      { name: 'Machine Leg Curl', unit: 'kg' },
    ];
  } else if (equipment === 'home_gym') {
    lowerBody = [
      { name: 'Dumbbell Bulgarian Split Squat', unit: 'kg/ea' },
      { name: 'Dumbbell Hip Thrust', unit: 'kg' },
    ];
  } else {
    lowerBody = [
      { name: 'Bodyweight Squat', unit: 'reps' },
      { name: 'Glute Bridge', unit: 'reps' },
    ];
  }

  return [
    ...lowerBody,
    { name: 'Flat Dumbbell Bench Press', unit: 'kg/ea' },
    { name: 'Seated Dumbbell Overhead Press', unit: 'kg/ea' },
    { name: 'Lat Pulldown', unit: 'kg' },
  ];
}

export default function OnboardingScreen() {
  const router = useRouter();
  const scrollRef = useRef(null);
  const [messages, setMessages] = useState([
    {
      role: 'aura',
      text: "Hey! I'm Aura, your new coach. Tell me about your fitness goals — what are you training for?",
      widgetType: 'elicitation',
    },
  ]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [locationName, setLocationNameState] = useState('My Gym');
  const [bodyStats, setBodyStats] = useState({ age: '', weight: '', gender: 'Male' });
  const [baselines, setBaselines] = useState({});
  const [schedule, setSchedule] = useState({ daysPerWeek: 4, minutesPerSession: 60 });
  const [currentStep, setCurrentStep] = useState('elicitation');

  // Phase 4: conversational elicitation state
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [elicitedData, setElicitedData] = useState(null);
  const [isElicitating, setIsElicitating] = useState(false);
  const [elicitationFailed, setElicitationFailed] = useState(false);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  }, [messages]);

  const addMessages = (...msgs) => {
    setMessages(prev => [...prev, ...msgs]);
  };

  // Phase 4: send a conversational elicitation message
  const handleElicitationSend = async () => {
    const text = chatInput.trim();
    if (!text || isElicitating) return;
    setChatInput('');

    addMessages({ role: 'user', text });

    const newHistory = [
      ...chatHistory,
      { role: 'user', parts: [{ text }] },
    ];

    setIsElicitating(true);
    try {
      const result = await sendElicitationMessage(text, newHistory);

      const updatedHistory = [
        ...newHistory,
        { role: 'model', parts: [{ text: result.text }] },
      ];
      setChatHistory(updatedHistory);

      if (result.isComplete && result.extractedData) {
        setElicitedData(result.extractedData);
        // Map primary goal to legacy goal string for backward compat
        const goalMap = { hypertrophy: 'build_muscle', body_composition: 'lose_fat', strength: 'increase_strength' };
        setSelectedGoal(goalMap[result.extractedData.goals?.primary] || result.extractedData.goals?.primary || 'general_health');
        addMessages({
          role: 'aura',
          text: result.text,
          widgetType: 'goalConfirmation',
        });
      } else {
        addMessages({
          role: 'aura',
          text: result.text,
          widgetType: 'elicitation',
        });
      }
    } catch (err) {
      console.error('[Elicitation error]', err);
      setElicitationFailed(true);
      setCurrentStep('goal');
      addMessages({
        role: 'aura',
        text: "No worries — let's do this the quick way instead. What's your primary focus?",
        widgetType: 'goal',
      });
    } finally {
      setIsElicitating(false);
    }
  };

  // Phase 4: confirm elicited goals and advance to equipment
  const handleConfirmGoals = () => {
    addMessages(
      { role: 'user', text: 'Looks good!' },
      { role: 'aura', text: 'Great! What equipment do we have to work with?', widgetType: 'equipment' },
    );
    setCurrentStep('equipment');
  };

  // Legacy fallback: static goal buttons
  const handleGoalSelect = (goal) => {
    setSelectedGoal(goal.id);
    addMessages(
      { role: 'user', text: goal.label },
      { role: 'aura', text: 'Got it. And what equipment do we have to work with?', widgetType: 'equipment' },
    );
    setCurrentStep('equipment');
  };

  const handleEquipmentSelect = (equip) => {
    setSelectedEquipment(equip.id);
    addMessages(
      { role: 'user', text: equip.label },
      { role: 'aura', text: "What should we call your training location? This helps me tailor exercise suggestions to your equipment.", widgetType: 'locationName' },
    );
    setCurrentStep('locationName');
  };

  const handleLocationNameSubmit = () => {
    addMessages(
      { role: 'user', text: locationName },
      { role: 'aura', text: "To tailor your training volume, I'll need your basic stats: Age, Weight, and Gender.", widgetType: 'bodyStats' },
    );
    setCurrentStep('bodyStats');
  };

  const handleBodyStatsSubmit = () => {
    if (!bodyStats.age || !bodyStats.weight) return;
    addMessages(
      { role: 'user', text: `${bodyStats.age}yo, ${bodyStats.weight}kg, ${bodyStats.gender}` },
      {
        role: 'aura',
        text: "How many days per week can you train, and how long per session?",
        widgetType: 'schedule',
      },
    );
    setCurrentStep('schedule');
  };

  const handleScheduleSubmit = () => {
    const exercises = getAssessmentExercises(selectedEquipment);
    setBaselines(Object.fromEntries(exercises.map(e => [e.name, { weight: '', reps: '' }])));
    addMessages(
      { role: 'user', text: `${schedule.daysPerWeek} days/week, ${schedule.minutesPerSession} min/session` },
      {
        role: 'aura',
        text: "Now, let's establish your baseline. I want you to perform 5 key exercises so I can calibrate your starting weights. Record your most recent heavy set for each:",
        widgetType: 'assessment',
      },
    );
    setCurrentStep('assessment');
  };

  const handleFinishAssessment = async () => {
    const exercises = getAssessmentExercises(selectedEquipment);
    const formattedBaselines = {};
    for (const exercise of exercises) {
      const entry = baselines[exercise.name];
      if (entry?.weight && entry?.reps) {
        formattedBaselines[exercise.name] = {
          weight: Number(entry.weight),
          reps: Number(entry.reps),
          perDumbbell: exercise.unit === 'kg/ea',
        };
      }
    }

    addMessages(
      { role: 'user', text: 'Assessment complete' },
      { role: 'aura', text: "Perfect. I'm building your personalized program now...", widgetType: 'loading' },
    );
    setCurrentStep('generating');

    try {
      let data;
      const goalLabel = GOALS.find(g => g.id === selectedGoal)?.label || selectedGoal;

      if (elicitedData) {
        // Phase 4: multi-modality plan generation
        data = await generateMultiModalityPlan({
          goals: elicitedData.goals,
          injuries: elicitedData.injuries || [],
          sport_context: elicitedData.sport_context || null,
          style_preferences: elicitedData.style_preferences || null,
          equipment: selectedEquipment,
          bodyStats: {
            age: Number(bodyStats.age),
            weight: Number(bodyStats.weight),
            gender: bodyStats.gender,
          },
          schedule,
          baselines: { exercises: formattedBaselines },
        });
      } else {
        // Legacy path: strength-only plan
        data = await generatePlan(goalLabel, selectedEquipment, {
          age: Number(bodyStats.age),
          weight: Number(bodyStats.weight),
          gender: bodyStats.gender,
          exercises: formattedBaselines,
        }, schedule);
      }

      await saveUserProfile(goalLabel, selectedEquipment, null, {
        age: Number(bodyStats.age),
        weight: Number(bodyStats.weight),
        gender: bodyStats.gender,
      }, schedule, {
        goalsJson: elicitedData?.goals || null,
        stylePreferencesJson: elicitedData?.style_preferences || null,
        sportContextJson: elicitedData?.sport_context || null,
        injuriesJson: elicitedData?.injuries || null,
      });
      await saveWorkoutPlan(data.plan);

      // Create initial default location based on equipment choice
      const equipmentMap = {
        commercial_gym: ['barbell', 'dumbbells', 'ez_curl_bar', 'kettlebells', 'cable_machine', 'smith_machine', 'leg_press', 'lat_pulldown', 'chest_press', 'leg_curl', 'leg_extension', 'pull_up_bar', 'dip_bars', 'bench'],
        home_gym: ['dumbbells', 'bench', 'resistance_bands'],
        bodyweight_only: ['pull_up_bar'],
      };
      const equipmentList = equipmentMap[selectedEquipment] || ['dumbbells'];
      await saveLocation(locationName.trim() || 'My Gym', equipmentList, true);

      router.replace('/(tabs)');
    } catch (err) {
      console.error(err);
      addMessages({
        role: 'aura',
        text: "Something went wrong generating your plan. Let's try again.",
        widgetType: 'assessment',
      });
      setCurrentStep('assessment');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.pulseOuter}>
            <View style={styles.pulseDot} />
          </View>
          <Text style={styles.headerTitle}>Aura</Text>
        </View>
        <TouchableOpacity>
          <MaterialIcons name="settings" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Chat Thread */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((msg, i) => (
          <View key={i} style={{ marginBottom: spacing.lg }}>
            {msg.role === 'aura' ? (
              <AuraMessage
                text={msg.text}
                widgetType={msg.widgetType}
                currentStep={currentStep}
                onGoalSelect={handleGoalSelect}
                onEquipmentSelect={handleEquipmentSelect}
                selectedEquipment={selectedEquipment}
                locationNameValue={locationName}
                setLocationNameValue={setLocationNameState}
                onLocationNameSubmit={handleLocationNameSubmit}
                bodyStats={bodyStats}
                setBodyStats={setBodyStats}
                onBodyStatsSubmit={handleBodyStatsSubmit}
                schedule={schedule}
                setSchedule={setSchedule}
                onScheduleSubmit={handleScheduleSubmit}
                assessmentExercises={getAssessmentExercises(selectedEquipment)}
                baselines={baselines}
                setBaselines={setBaselines}
                onFinishAssessment={handleFinishAssessment}
                onConfirmGoals={handleConfirmGoals}
                elicitedData={elicitedData}
              />
            ) : (
              <UserMessage text={msg.text} />
            )}
          </View>
        ))}
      </ScrollView>

      {/* Bottom Input — enabled during elicitation, disabled during structured steps */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.footer}>
          {isElicitating && (
            <View style={styles.elicitatingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.elicitatingText}>Thinking...</Text>
            </View>
          )}
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.micButton}>
              <MaterialIcons name="mic" size={24} color={colors.bgDark} />
            </TouchableOpacity>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder={currentStep === 'elicitation' ? 'Tell Aura about your goals...' : 'Type a message...'}
                placeholderTextColor={colors.textSecondary}
                editable={currentStep === 'elicitation' && !isElicitating}
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={handleElicitationSend}
                returnKeyType="send"
              />
              {currentStep === 'elicitation' && chatInput.trim().length > 0 && (
                <TouchableOpacity style={styles.sendButton} onPress={handleElicitationSend} disabled={isElicitating}>
                  <MaterialIcons name="send" size={20} color={colors.bgDark} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Bottom Nav */}
          <View style={styles.bottomNav}>
            <NavItem icon="chat-bubble" label="Coach" active />
            <NavItem icon="leaderboard" label="Stats" />
            <NavItem icon="person" label="Profile" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AuraMessage({
  text, widgetType, currentStep, onGoalSelect, onEquipmentSelect, selectedEquipment,
  locationNameValue, setLocationNameValue, onLocationNameSubmit,
  bodyStats, setBodyStats, onBodyStatsSubmit,
  schedule, setSchedule, onScheduleSubmit,
  assessmentExercises, baselines, setBaselines, onFinishAssessment,
  onConfirmGoals, elicitedData,
}) {
  return (
    <View style={styles.auraRow}>
      <View style={styles.avatar}>
        <MaterialIcons name="bolt" size={16} color={colors.bgDark} />
      </View>
      <View style={styles.auraContent}>
        <View style={styles.auraBubble}>
          <Text style={styles.auraText}>{text}</Text>
        </View>

        {widgetType === 'goal' && (currentStep === 'goal' || currentStep === 'elicitation') && (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            {GOALS.map(goal => (
              <TouchableOpacity key={goal.id} style={styles.goalButton} onPress={() => onGoalSelect(goal)}>
                <Text style={styles.goalButtonText}>{goal.label}</Text>
                <MaterialIcons name={goal.icon} size={20} color={colors.bgDark} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {widgetType === 'goalConfirmation' && currentStep === 'elicitation' && elicitedData && (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <View style={styles.confirmationCard}>
              {elicitedData.goals?.primary && (
                <View style={styles.confirmRow}>
                  <MaterialIcons name="flag" size={16} color={colors.primary} />
                  <Text style={styles.confirmLabel}>Goal: <Text style={styles.confirmValue}>{elicitedData.goals.primary.replace(/_/g, ' ')}</Text></Text>
                </View>
              )}
              {elicitedData.goals?.modalities?.length > 0 && (
                <View style={styles.confirmRow}>
                  <MaterialIcons name="category" size={16} color={colors.primary} />
                  <Text style={styles.confirmLabel}>Modalities: <Text style={styles.confirmValue}>{elicitedData.goals.modalities.join(', ')}</Text></Text>
                </View>
              )}
              {elicitedData.sport_context?.sport && (
                <View style={styles.confirmRow}>
                  <MaterialIcons name="sports" size={16} color={colors.primary} />
                  <Text style={styles.confirmLabel}>Sport: <Text style={styles.confirmValue}>{elicitedData.sport_context.sport}</Text></Text>
                </View>
              )}
              {elicitedData.injuries?.length > 0 && (
                <View style={styles.confirmRow}>
                  <MaterialIcons name="healing" size={16} color={colors.primaryDim} />
                  <Text style={styles.confirmLabel}>Injuries: <Text style={styles.confirmValue}>{elicitedData.injuries.map(i => i.area).join(', ')}</Text></Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.continueButton} onPress={onConfirmGoals}>
              <Text style={styles.continueButtonText}>Looks good!</Text>
            </TouchableOpacity>
          </View>
        )}

        {widgetType === 'equipment' && currentStep === 'equipment' && (
          <View style={styles.equipmentCard}>
            {EQUIPMENT.map(equip => (
              <TouchableOpacity key={equip.id} style={styles.equipmentRow} onPress={() => onEquipmentSelect(equip)}>
                <MaterialIcons
                  name={selectedEquipment === equip.id ? 'check-circle' : 'radio-button-unchecked'}
                  size={22}
                  color={selectedEquipment === equip.id ? colors.primary : colors.textSecondary}
                />
                <Text style={[
                  styles.equipmentLabel,
                  selectedEquipment === equip.id && { color: colors.primary, fontFamily: 'Inter_700Bold' }
                ]}>{equip.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {widgetType === 'locationName' && currentStep === 'locationName' && (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <TextInput
              style={styles.statsInput}
              placeholder="My Gym"
              placeholderTextColor={colors.textMuted}
              value={locationNameValue}
              onChangeText={setLocationNameValue}
              autoFocus
            />
            <TouchableOpacity style={styles.continueButton} onPress={onLocationNameSubmit}>
              <Text style={styles.continueButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {widgetType === 'bodyStats' && currentStep === 'bodyStats' && (
          <BodyStatsWidget
            bodyStats={bodyStats}
            setBodyStats={setBodyStats}
            onSubmit={onBodyStatsSubmit}
          />
        )}

        {widgetType === 'schedule' && currentStep === 'schedule' && (
          <ScheduleWidget
            schedule={schedule}
            setSchedule={setSchedule}
            onSubmit={onScheduleSubmit}
          />
        )}

        {widgetType === 'assessment' && currentStep === 'assessment' && (
          <StrengthAssessmentWidget
            exercises={assessmentExercises}
            baselines={baselines}
            setBaselines={setBaselines}
            onFinish={onFinishAssessment}
          />
        )}

        {widgetType === 'loading' && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Analyzing your profile & building program...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function BodyStatsWidget({ bodyStats, setBodyStats, onSubmit }) {
  return (
    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput
            style={styles.statsInput}
            placeholder="25"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={bodyStats.age}
            onChangeText={v => setBodyStats(s => ({ ...s, age: v }))}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Weight (kg)</Text>
          <TextInput
            style={styles.statsInput}
            placeholder="75"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            value={bodyStats.weight}
            onChangeText={v => setBodyStats(s => ({ ...s, weight: v }))}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {GENDERS.map(g => (
          <TouchableOpacity
            key={g}
            style={[
              styles.genderPill,
              bodyStats.gender === g && styles.genderPillActive,
            ]}
            onPress={() => setBodyStats(s => ({ ...s, gender: g }))}
          >
            <Text style={[
              styles.genderPillText,
              bodyStats.gender === g && styles.genderPillTextActive,
            ]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.continueButton, (!bodyStats.age || !bodyStats.weight) && { opacity: 0.5 }]}
        onPress={onSubmit}
        disabled={!bodyStats.age || !bodyStats.weight}
      >
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

function StrengthAssessmentWidget({ exercises, baselines, setBaselines, onFinish }) {
  const updateBaseline = (exercise, field, value) => {
    setBaselines(prev => ({
      ...prev,
      [exercise]: { ...prev[exercise], [field]: value },
    }));
  };

  return (
    <View style={styles.assessmentCard}>
      <View style={styles.assessmentHeader}>
        <MaterialIcons name="fitness-center" size={20} color={colors.primary} />
        <Text style={styles.assessmentTitle}>Strength Assessment</Text>
      </View>

      {exercises.map(exercise => (
        <View key={exercise.name} style={styles.exerciseBlock}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1, position: 'relative' }}>
              <TextInput
                style={styles.exerciseInput}
                placeholder="Weight"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={baselines[exercise.name]?.weight}
                onChangeText={v => updateBaseline(exercise.name, 'weight', v)}
              />
              <Text style={styles.inputUnit}>{exercise.unit}</Text>
            </View>
            <View style={{ flex: 1, position: 'relative' }}>
              <TextInput
                style={styles.exerciseInput}
                placeholder="Reps"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={baselines[exercise.name]?.reps}
                onChangeText={v => updateBaseline(exercise.name, 'reps', v)}
              />
              <Text style={styles.inputUnit}>reps</Text>
            </View>
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.finishButton} onPress={onFinish}>
        <Text style={styles.finishButtonText}>Finish Assessment</Text>
      </TouchableOpacity>
    </View>
  );
}

const DAYS_OPTIONS = [3, 4, 5, 6];
const MINUTES_OPTIONS = [30, 45, 60, 75, 90];

function ScheduleWidget({ schedule, setSchedule, onSubmit }) {
  return (
    <View style={styles.scheduleCard}>
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.fieldLabel}>Days Per Week</Text>
        <View style={styles.schedulePillRow}>
          {DAYS_OPTIONS.map(d => (
            <TouchableOpacity
              key={d}
              style={[
                styles.schedulePill,
                schedule.daysPerWeek === d && styles.schedulePillActive,
              ]}
              onPress={() => setSchedule(s => ({ ...s, daysPerWeek: d }))}
            >
              <Text style={[
                styles.schedulePillText,
                schedule.daysPerWeek === d && styles.schedulePillTextActive,
              ]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.xs }}>
        <Text style={styles.fieldLabel}>Minutes Per Session</Text>
        <View style={styles.schedulePillRow}>
          {MINUTES_OPTIONS.map(m => (
            <TouchableOpacity
              key={m}
              style={[
                styles.schedulePill,
                schedule.minutesPerSession === m && styles.schedulePillActive,
              ]}
              onPress={() => setSchedule(s => ({ ...s, minutesPerSession: m }))}
            >
              <Text style={[
                styles.schedulePillText,
                schedule.minutesPerSession === m && styles.schedulePillTextActive,
              ]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <TouchableOpacity style={styles.continueButton} onPress={onSubmit}>
        <Text style={styles.continueButtonText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

function UserMessage({ text }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  );
}

function NavItem({ icon, label, active }) {
  return (
    <TouchableOpacity style={styles.navItem}>
      <MaterialIcons name={icon} size={24} color={active ? colors.primary : colors.textSecondary} />
      <Text style={[styles.navLabel, active && { color: colors.primary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pulseOuter: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primaryFaint, justifyContent: 'center', alignItems: 'center' },
  pulseDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.textPrimary, letterSpacing: -0.5 },
  chatArea: { flex: 1 },
  chatContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  footer: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderLight },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  micButton: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  inputWrapper: { flex: 1 },
  input: {
    backgroundColor: colors.bgCard, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    color: colors.textPrimary, fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: spacing.lg, paddingBottom: spacing.sm },
  navItem: { alignItems: 'center', gap: 4 },
  navLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },

  // Aura messages
  auraRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  auraContent: { flex: 1, maxWidth: '85%' },
  auraBubble: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderTopLeftRadius: 0, padding: spacing.md,
  },
  auraText: { fontSize: 15, fontFamily: 'Inter_400Regular', color: colors.textPrimary, lineHeight: 22 },

  // Goal buttons
  goalButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary,
  },
  goalButtonText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.bgDark },

  // Equipment
  equipmentCard: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.sm, gap: 4, marginTop: spacing.sm },
  equipmentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md },
  equipmentLabel: { fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.textSecondary },

  // Body Stats
  fieldLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', color: colors.textSecondary, textTransform: 'uppercase', marginLeft: 8, marginBottom: 4 },
  statsInput: {
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    color: colors.textPrimary, fontSize: 15, fontFamily: 'Inter_400Regular',
  },
  genderPill: {
    paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  genderPillActive: { borderColor: colors.primary },
  genderPillText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary },
  genderPillTextActive: { color: colors.primary },
  continueButton: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.xs,
  },
  continueButtonText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.bgDark },

  // Schedule widget
  scheduleCard: {
    gap: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md,
  },
  schedulePillRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  schedulePill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: radius.full,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    minWidth: 48,
  },
  schedulePillActive: {
    borderColor: colors.primary, backgroundColor: 'rgba(212,255,0,0.08)',
  },
  schedulePillText: {
    fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary,
  },
  schedulePillTextActive: {
    color: colors.primary, fontFamily: 'Inter_700Bold',
  },

  // Strength Assessment
  assessmentCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: spacing.md, marginTop: spacing.sm, gap: spacing.lg,
  },
  assessmentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  assessmentTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.textPrimary },
  exerciseBlock: { gap: spacing.sm },
  exerciseName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },
  exerciseInput: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.default,
    paddingLeft: 12, paddingRight: 36, paddingVertical: 12,
    color: colors.textPrimary, fontSize: 14, fontFamily: 'Inter_400Regular',
  },
  inputUnit: {
    position: 'absolute', right: 12, top: '50%', transform: [{ translateY: -6 }],
    fontSize: 10, fontFamily: 'Inter_400Regular', color: colors.textSecondary,
  },
  finishButton: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.2, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12,
  },
  finishButtonText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: colors.bgDark },

  // Loading
  loadingCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgCard, marginTop: spacing.sm,
  },
  loadingText: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary },

  // Elicitation UI
  elicitatingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingTop: spacing.sm, paddingHorizontal: spacing.xs,
  },
  elicitatingText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.textSecondary },
  sendButton: {
    position: 'absolute', right: 6, top: '50%', transform: [{ translateY: -16 }],
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  confirmationCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: spacing.md, gap: spacing.sm,
    borderWidth: 1, borderColor: 'rgba(212, 255, 0, 0.15)',
  },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  confirmLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.textSecondary },
  confirmValue: { fontFamily: 'Inter_600SemiBold', color: colors.textPrimary },

  // User messages
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '80%', padding: spacing.md, borderRadius: radius.lg,
    borderTopRightRadius: 0, backgroundColor: colors.primaryFaint,
    borderWidth: 1, borderColor: 'rgba(212, 255, 0, 0.3)',
  },
  userText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.primary },
});
