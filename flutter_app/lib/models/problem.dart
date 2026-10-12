class Problem {
  final int id;
  final String title;
  final String difficulty;
  final List<String> tags;
  final int accepted;
  final bool solved;

  const Problem({
    required this.id,
    required this.title,
    required this.difficulty,
    required this.tags,
    required this.accepted,
    required this.solved,
  });
}
