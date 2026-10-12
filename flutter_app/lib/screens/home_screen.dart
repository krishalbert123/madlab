import 'package:flutter/material.dart';

import '../models/problem.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  static const List<Problem> _sampleProblems = [
    Problem(
      id: 1,
      title: 'Two Sum',
      difficulty: 'Easy',
      tags: ['Array', 'Hash Map'],
      accepted: 78,
      solved: true,
    ),
    Problem(
      id: 2,
      title: 'Median of Two Arrays',
      difficulty: 'Hard',
      tags: ['Binary Search', 'Array'],
      accepted: 38,
      solved: false,
    ),
    Problem(
      id: 3,
      title: 'Valid Parentheses',
      difficulty: 'Easy',
      tags: ['String', 'Stack'],
      accepted: 71,
      solved: true,
    ),
    Problem(
      id: 4,
      title: 'Longest Palindromic Substring',
      difficulty: 'Medium',
      tags: ['String', 'DP'],
      accepted: 54,
      solved: false,
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('CodeArena'),
        backgroundColor: const Color(0xFF111318),
        foregroundColor: Colors.white,
        elevation: 0,
        actions: [
          TextButton(
            onPressed: () {},
            child: const Text('Problems'),
          ),
          TextButton(
            onPressed: () {},
            child: const Text('Leaderboard'),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF111318), Color(0xFF1A1D26)],
                  ),
                  border: Border.all(color: const Color(0xFF2A2D3A)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: const Color(0xFF04181B),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: const Color(0xFF00E5FF)),
                      ),
                      child: const Text(
                        '⚡ 100 Problems • Live Terminal',
                        style: TextStyle(
                          color: Color(0xFF00E5FF),
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      'The Ultimate\nCode Arena',
                      style: TextStyle(
                        fontSize: 42,
                        fontWeight: FontWeight.w800,
                        height: 1.05,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Practice competitive programming problems, compile code, and work through a terminal experience built for daily practice.',
                      style: TextStyle(
                        color: Color(0xFF94A3B8),
                        fontSize: 16,
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Wrap(
                      spacing: 12,
                      runSpacing: 12,
                      children: [
                        FilledButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.code),
                          label: const Text('Solve Problems'),
                        ),
                        OutlinedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.terminal),
                          label: const Text('Open Terminal'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              const Text(
                'Featured Problems',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 16),
              ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _sampleProblems.length,
                separatorBuilder: (_, __) => const SizedBox(height: 12),
                itemBuilder: (context, index) {
                  final problem = _sampleProblems[index];
                  return Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF111318),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: const Color(0xFF2A2D3A)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '#${problem.id} ${problem.title}',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: problem.tags
                                    .map(
                                      (tag) => Chip(
                                        label: Text(tag),
                                        visualDensity: VisualDensity.compact,
                                      ),
                                    )
                                    .toList(),
                              ),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: problem.difficulty == 'Easy'
                                    ? const Color(0xFF123A2D)
                                    : problem.difficulty == 'Medium'
                                        ? const Color(0xFF47340F)
                                        : const Color(0xFF3F1A1A),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                problem.difficulty,
                                style: TextStyle(
                                  color: problem.difficulty == 'Easy'
                                      ? const Color(0xFF34D399)
                                      : problem.difficulty == 'Medium'
                                          ? const Color(0xFFFBBF24)
                                          : const Color(0xFFF87171),
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '${problem.accepted}% accept',
                              style: const TextStyle(
                                color: Color(0xFF94A3B8),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
