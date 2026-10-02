% --- Game Configuration ---
max_rows(6).
max_cols(7).
player_token(x).
ai_token(o).
max_depth(4). % Increase for stronger play, decrease if too slow

% --- Entry Point ---
play :- 
    empty_board(Board),
    print_board(Board),
    game_loop(Board, x).

empty_board([[],[],[],[],[],[],[]]).

% --- Main Game Loop ---
game_loop(Board, _) :-
    winning_board(Board, x), !,
    writeln('Player (x) wins!').
game_loop(Board, _) :-
    winning_board(Board, o), !,
    writeln('AI (o) wins!').
game_loop(Board, _) :-
    board_full(Board), !,
    writeln('It is a draw!').

game_loop(Board, x) :-
    writeln('Your turn (x).'),
    repeat,
    write('Choose a column (0-6): '),
    read(Col),
    (valid_move(Board, Col) -> 
        make_move(Board, Col, x, NewBoard),
        print_board(NewBoard),
        game_loop(NewBoard, o)
    ;   writeln('Invalid move. Try again.'), fail).

game_loop(Board, o) :-
    writeln('AI is thinking...'),
    max_depth(Depth),
    minimax(Board, Depth, o, BestCol, _Score),
    format('AI chooses column ~w.~n', [BestCol]),
    make_move(Board, BestCol, o, NewBoard),
    print_board(NewBoard),
    game_loop(NewBoard, x).

% --- Move Validation & Execution ---
valid_move(Board, Col) :-
    Col >= 0, Col < 7,
    nth0(Col, Board, ColumnList),
    max_rows(Max),
    length(ColumnList, Len),
    Len < Max.

make_move(Board, Col, Player, NewBoard) :-
    nth0(Col, Board, OldCol, RestCols),
    append(OldCol, [Player], NewCol),
    nth0(Col, NewBoard, NewCol, RestCols).

board_full(Board) :-
    max_rows(Max),
    forall(member(Col, Board), length(Col, Max)).

% --- Minimax Algorithm ---
minimax(Board, 0, Player, -1, Score) :- !,
    evaluate_board(Board, Player, Score).
minimax(Board, Depth, Player, BestCol, BestScore) :-
    findall(Col, valid_move(Board, Col), Moves),
    (Moves = [] -> 
        evaluate_board(Board, Player, BestScore), BestCol = -1
    ;   evaluate_moves(Board, Moves, Depth, Player, -1, -1000000, BestCol, BestScore)
    ).

evaluate_moves(_, [], _, _, BestCol, BestScore, BestCol, BestScore).
evaluate_moves(Board, [Col|Rest], Depth, Player, CurrentBestCol, CurrentBestScore, FinalCol, FinalScore) :-
    make_move(Board, Col, Player, NewBoard),
    next_player(Player, NextPlayer),
    NewDepth is Depth - 1,
    % Check immediate win before recursing further
    (winning_board(NewBoard, Player) ->
        OpponentScore = -100000 % Win for current player means terrible score for opponent
    ;   minimax(NewBoard, NewDepth, NextPlayer, _, OpponentScore)
    ),
    Score is -OpponentScore, % Invert score for zero-sum game
    (Score > CurrentBestScore ->
        evaluate_moves(Board, Rest, Depth, Player, Col, Score, FinalCol, FinalScore)
    ;   evaluate_moves(Board, Rest, Depth, Player, CurrentBestCol, CurrentBestScore, FinalCol, FinalScore)
    ).

next_player(x, o).
next_player(o, x).

% --- Board Evaluation (Heuristic) ---
evaluate_board(Board, Player, Score) :-
    winning_board(Board, Player), !, Score = 10000.
evaluate_board(Board, Player, Score) :-
    next_player(Player, Opponent),
    winning_board(Board, Opponent), !, Score = -10000.
evaluate_board(Board, Player, Score) :-
    % Basic heuristic: Count open 3-in-a-rows and 2-in-a-rows
    count_sequences(Board, Player, 3, P3),
    count_sequences(Board, Player, 2, P2),
    next_player(Player, Opponent),
    count_sequences(Board, Opponent, 3, O3),
    count_sequences(Board, Opponent, 2, O2),
    Score is (P3 * 100 + P2 * 10) - (O3 * 100 + O2 * 10).

% --- Win Condition Tracking ---
winning_board(Board, P) :- horizontal_win(Board, P).
winning_board(Board, P) :- vertical_win(Board, P).
winning_board(Board, P) :- diagonal_win(Board, P).

horizontal_win(Board, P) :-
    between(0, 5, Row),
    between(0, 3, Col),
    cell(Board, Col, Row, P),
    C1 is Col + 1, cell(Board, C1, Row, P),
    C2 is Col + 2, cell(Board, C2, Row, P),
    C3 is Col + 3, cell(Board, C3, Row, P).

vertical_win(Board, P) :-
    member(Column, Board),
    append(_, [P,P,P,P|_], Column).

diagonal_win(Board, P) :-
    % Positive slope /
    between(0, 3, Col), between(0, 2, Row),
    cell(Board, Col, Row, P),
    C1 is Col + 1, R1 is Row + 1, cell(Board, C1, R1, P),
    C2 is Col + 2, R2 is Row + 2, cell(Board, C2, R2, P),
    C3 is Col + 3, R3 is Row + 3, cell(Board, C3, R3, P).
diagonal_win(Board, P) :-
    % Negative slope \
    between(0, 3, Col), between(3, 5, Row),
    cell(Board, Col, Row, P),
    C1 is Col + 1, R1 is Row - 1, cell(Board, C1, R1, P),
    C2 is Col + 2, R2 is Row - 2, cell(Board, C2, R2, P),
    C3 is Col + 3, R3 is Row - 3, cell(Board, C3, R3, P).

cell(Board, Col, Row, Player) :-
    nth0(Col, Board, ColumnList),
    nth0(Row, ColumnList, Player).

% --- Basic Heuristic Count Helpers ---
count_sequences(Board, P, Size, Count) :-
    aggregate_all(count, sequence_match(Board, P, Size), Count).

sequence_match(Board, P, 3) :-
    % Look for 3-in-a-row combos vertically
    member(Column, Board), append(_, [P,P,P], Column).
sequence_match(Board, P, 2) :-
    member(Column, Board), append(_, [P,P], Column).

% --- Visualise Board ---
print_board(Board) :-
    nl,
    foreach(between(0, 5, R), (
        RowIndex is 5 - R,
        foreach(between(0, 6, C), (
            (cell(Board, C, RowIndex, Token) -> true ; Token = '.'),
            format('~w ', [Token])
        )),
        nl
    )),
    writeln('0 1 2 3 4 5 6'), nl.
