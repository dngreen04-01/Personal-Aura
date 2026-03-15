import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../lib/theme';
import {
  getLocations, saveLocation, updateLocation, deleteLocation, setDefaultLocation,
  linkLocationToShared,
} from '../lib/database';
import { createSharedLocation } from '../lib/api';
import { EQUIPMENT_CATEGORIES } from '../lib/equipmentData';

export default function LocationsScreen() {
  const router = useRouter();
  const [locations, setLocations] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [shareWithCommunity, setShareWithCommunity] = useState(false);

  const loadLocations = useCallback(async () => {
    try {
      const locs = await getLocations();
      setLocations(locs);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const openAddModal = () => {
    setEditingLocation(null);
    setLocationName('');
    setSelectedEquipment([]);
    setShareWithCommunity(false);
    setModalVisible(true);
  };

  const openEditModal = (loc) => {
    setEditingLocation(loc);
    setLocationName(loc.name);
    setSelectedEquipment(Array.isArray(loc.equipment_list) ? loc.equipment_list : []);
    setModalVisible(true);
  };

  const toggleEquipment = (id) => {
    setSelectedEquipment(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    const name = locationName.trim();
    if (!name) return;
    try {
      if (editingLocation) {
        await updateLocation(editingLocation.id, name, selectedEquipment);
      } else {
        const localId = await saveLocation(name, selectedEquipment, locations.length === 0);
        // Share with community if toggled
        if (shareWithCommunity) {
          try {
            const result = await createSharedLocation({
              name,
              address: '',
              lat: 0,
              lon: 0,
              equipment: selectedEquipment,
            });
            if (result.id) {
              await linkLocationToShared(localId, result.id);
            }
          } catch (shareErr) {
            console.warn('Failed to share location:', shareErr.message);
          }
        }
      }
      setModalVisible(false);
      await loadLocations();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = (loc) => {
    Alert.alert('Delete Location', `Remove "${loc.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteLocation(loc.id);
          await loadLocations();
        },
      },
    ]);
  };

  const handleSetDefault = async (loc) => {
    await setDefaultLocation(loc.id);
    await loadLocations();
  };

  const equipmentSummary = (list) => {
    if (!Array.isArray(list) || list.length === 0) return 'No equipment';
    if (list.length <= 3) return list.map(id => {
      for (const cat of EQUIPMENT_CATEGORIES) {
        const item = cat.items.find(i => i.id === id);
        if (item) return item.label;
      }
      return id;
    }).join(', ');
    return `${list.length} items`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Locations</Text>
        <View style={styles.headerButton} />
      </View>

      {/* Find Nearby Gyms */}
      <View style={styles.nearbySection}>
        <TouchableOpacity
          style={styles.nearbyButton}
          onPress={() => router.push('/shared-locations')}
          activeOpacity={0.85}
        >
          <MaterialIcons name="explore" size={20} color={colors.primary} />
          <Text style={styles.nearbyButtonText}>Find Nearby Gyms</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Location List */}
      <ScrollView style={styles.listArea} contentContainerStyle={styles.listContent}>
        {locations.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="location-on" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No locations yet</Text>
            <Text style={styles.emptySubtext}>Add your gym or workout space to get equipment-aware coaching.</Text>
          </View>
        )}

        {locations.map(loc => (
          <View key={loc.id} style={styles.locationCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleRow}>
                <MaterialIcons name="location-on" size={20} color={colors.primary} />
                <Text style={styles.cardName}>{loc.name}</Text>
                {loc.shared_location_id && (
                  <MaterialIcons name="people" size={16} color={colors.primaryDim} />
                )}
                {loc.is_default === 1 && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                  </View>
                )}
              </View>
              <Text style={styles.cardEquipment}>{equipmentSummary(loc.equipment_list)}</Text>
            </View>
            <View style={styles.cardActions}>
              {loc.is_default !== 1 && (
                <TouchableOpacity style={styles.actionButton} onPress={() => handleSetDefault(loc)}>
                  <MaterialIcons name="star-outline" size={18} color={colors.textSecondary} />
                  <Text style={styles.actionText}>Set Default</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionButton} onPress={() => openEditModal(loc)}>
                <MaterialIcons name="edit" size={18} color={colors.textSecondary} />
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(loc)}>
                <MaterialIcons name="delete-outline" size={18} color="#ef4444" />
                <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Add Button */}
      <View style={styles.bottomSection}>
        <TouchableOpacity style={styles.addButton} onPress={openAddModal} activeOpacity={0.85}>
          <MaterialIcons name="add" size={22} color={colors.bgDark} />
          <Text style={styles.addButtonText}>Add Location</Text>
        </TouchableOpacity>
      </View>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingLocation ? 'Edit Location' : 'New Location'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Name Input */}
              <Text style={styles.fieldLabel}>LOCATION NAME</Text>
              <TextInput
                style={styles.nameInput}
                placeholder="e.g. Home Gym, Planet Fitness"
                placeholderTextColor={colors.textMuted}
                value={locationName}
                onChangeText={setLocationName}
                autoFocus={!editingLocation}
              />

              {/* Share with Community Toggle */}
              {!editingLocation && (
                <TouchableOpacity
                  style={styles.shareToggle}
                  onPress={() => setShareWithCommunity(prev => !prev)}
                >
                  <MaterialIcons
                    name={shareWithCommunity ? 'check-circle' : 'radio-button-unchecked'}
                    size={22}
                    color={shareWithCommunity ? colors.primary : colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[
                      styles.shareToggleText,
                      shareWithCommunity && { color: colors.primary },
                    ]}>Share with community</Text>
                    <Text style={styles.shareToggleSubtext}>
                      Other users can find and contribute to this gym
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Equipment Checklist */}
              <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>AVAILABLE EQUIPMENT</Text>
              {EQUIPMENT_CATEGORIES.map(cat => (
                <View key={cat.category} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>{cat.category}</Text>
                  {cat.items.map(item => {
                    const checked = selectedEquipment.includes(item.id);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.equipmentRow}
                        onPress={() => toggleEquipment(item.id)}
                      >
                        <MaterialIcons
                          name={checked ? 'check-circle' : 'radio-button-unchecked'}
                          size={22}
                          color={checked ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[
                          styles.equipmentLabel,
                          checked && { color: colors.primary, fontFamily: 'Inter_700Bold' },
                        ]}>{item.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, !locationName.trim() && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={!locationName.trim()}
              activeOpacity={0.85}
            >
              <Text style={styles.saveButtonText}>
                {editingLocation ? 'Save Changes' : 'Add Location'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  headerButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: colors.textPrimary },

  listArea: { flex: 1 },
  listContent: { padding: spacing.lg, gap: spacing.md },

  emptyState: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.textPrimary },
  emptySubtext: { fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },

  locationCard: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden',
  },
  cardHeader: { padding: spacing.md, gap: spacing.xs },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardName: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.textPrimary, flex: 1 },
  defaultBadge: {
    backgroundColor: colors.primaryFaint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
    borderWidth: 1, borderColor: 'rgba(212,255,0,0.2)',
  },
  defaultBadgeText: { fontSize: 9, fontFamily: 'Inter_800ExtraBold', color: colors.primary, letterSpacing: 1 },
  cardEquipment: { fontSize: 13, fontFamily: 'Inter_400Regular', color: colors.textSecondary, marginLeft: 28 },

  cardActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  actionButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.sm,
  },
  actionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary },

  bottomSection: { padding: spacing.lg, paddingBottom: spacing.xl },
  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radius.lg,
  },
  addButtonText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.bgDark },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.bgDark, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    maxHeight: '90%', paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle,
  },
  modalTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: colors.textPrimary },
  modalScroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  fieldLabel: {
    fontSize: 11, fontFamily: 'Inter_700Bold', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm,
  },
  nameInput: {
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 14,
    color: colors.textPrimary, fontSize: 15, fontFamily: 'Inter_400Regular',
    borderWidth: 1, borderColor: colors.borderLight,
  },

  categorySection: { marginBottom: spacing.md },
  categoryTitle: {
    fontSize: 13, fontFamily: 'Inter_600SemiBold', color: colors.textMuted,
    marginBottom: spacing.xs, marginTop: spacing.sm,
  },
  equipmentRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
  },
  equipmentLabel: { fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.textSecondary },

  saveButton: {
    backgroundColor: colors.primary, borderRadius: radius.lg,
    paddingVertical: spacing.md, alignItems: 'center',
    marginHorizontal: spacing.lg, marginTop: spacing.md,
  },
  saveButtonText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.bgDark },

  nearbySection: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  nearbyButton: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.borderLight,
  },
  nearbyButtonText: {
    flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.textPrimary,
  },

  shareToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    marginBottom: spacing.sm,
  },
  shareToggleText: {
    fontSize: 15, fontFamily: 'Inter_600SemiBold', color: colors.textSecondary,
  },
  shareToggleSubtext: {
    fontSize: 12, fontFamily: 'Inter_400Regular', color: colors.textMuted, marginTop: 2,
  },
});
