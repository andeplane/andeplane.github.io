export type Species = 'tomato' | 'cactus' | 'flytrap';
export type Layer = 'natural' | 'water' | 'carbon';
export type Equipment = 'drainage' | 'sensor' | 'lamp' | 'fan';
export type Action = 'water100' | 'water250' | 'water500' | 'feed' | 'prey' | 'prune';
export interface Mission {
  id: Species; name: string; latin: string; family: string; title: string; description: string;
  objective: string; days: number; target: number; budget: number; water: number; energy: number;
  initialMoisture: number; initialN: number; light: number; temperature: number;
  heatStart?: number; heatEnd?: number; heatBoost?: number; nightBoost?: number; cloudStart?: number; cloudEnd?: number; cloudFactor?: number;
  fact: string; source: string; sourceLabel: string;
}
export const missions: Mission[] = [
  { id: 'tomato', name: 'Tomato', latin: 'Solanum lycopersicum', family: 'C₃ · Fruiting annual', title: 'A promising beginning',
    description: 'Establish a young tomato before a forecast heatwave. Water is limited. Healthy roots will matter as much as healthy leaves.',
    objective: 'Reach 6.5 g dry biomass with ≥ 75% vitality by day 12.', days: 12, target: 6.5, budget: 180, water: 2.5, energy: 6,
    initialMoisture: .66, initialN: 75, light: 1, temperature: 24,
    fact: 'Waterlogged roots can run short of oxygen. A wilted plant may need better drainage rather than another drink.',
    source: 'https://www.ontario.ca/page/irrigation-scheduling-tomatoes', sourceLabel: 'Ontario Ministry of Agriculture · Irrigation scheduling' },
  { id: 'cactus', name: 'Prickly pear', latin: 'Opuntia ficus-indica', family: 'CAM · Desert succulent', title: 'The quiet hours',
    description: 'A desert succulent gathers carbon at night. Establish new growth while a hot spell tests its water stores and your restraint.',
    objective: 'Reach 4.0 g dry biomass with ≥ 75% vitality by day 18.', days: 18, target: 4.0, budget: 145, water: 1.2, energy: 5,
    initialMoisture: .46, initialN: 70, light: 1.12, temperature: 28,
    fact: 'CAM plants store nighttime carbon uptake as organic acids, then release CO₂ for photosynthesis in daylight. They still need light.',
    source: 'https://askabiologist.asu.edu/cam-plants', sourceLabel: 'Arizona State University · CAM plants' },
  { id: 'flytrap', name: 'Venus flytrap', latin: 'Dionaea muscipula', family: 'C₃ · Carnivorous perennial', title: 'Less is more',
    description: 'Grow a bog specialist in an acidic, nutrient-poor substrate. Keep it moist and remember: insects supply nutrients, sunlight supplies energy.',
    objective: 'Reach 5.1 g dry biomass with ≥ 75% vitality by day 16.', days: 16, target: 5.1, budget: 150, water: 3.5, energy: 6,
    initialMoisture: .68, initialN: 8, light: .92, temperature: 23,
    fact: 'Flytraps are native to wet, acidic, nutrient-poor habitats. Captured prey supplements mineral nutrition; it does not replace photosynthesis.',
    source: 'https://www.kew.org/plants/venus-flytrap', sourceLabel: 'Royal Botanic Gardens, Kew · Venus flytrap' },
];

export const missionFor = (id: Species) => missions.find(m => m.id === id)!;
