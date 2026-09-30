import math
import copy

# --- Game Configuration ---
ROWS = 6
COLS = 7
EMPTY = 0
PLAYER_PIECE = 1
AI_PIECE = 2
WINDOW_LENGTH = 4
MAX_DEPTH = 7  # Increase for a harder challenge, decrease for speed

def create_board():
    return [[EMPTY for _ in range(COLS)] for _ in range(ROWS)]

def print_board(board):
    # Print the board upside down so row 0 is at the bottom
    for r in range(ROWS - 1, -1, -1):
        row_str = []
        for c in range(COLS):
            if board[r][c] == EMPTY:
                row_str.append(".")
            elif board[r][c] == PLAYER_PIECE:
                row_str.append("X")
            else:
                row_str.append("O")
        print(" ".join(row_str))
    print("0 1 2 3 4 5 6\n")

def is_valid_location(board, col):
    return board[ROWS - 1][col] == EMPTY

def get_next_open_row(board, col):
    for r in range(ROWS):
        if board[r][col] == EMPTY:
            return r

def drop_piece(board, row, col, piece):
    board[row][col] = piece

def check_win(board, piece):
    # Check horizontal locations
    for c in range(COLS - 3):
        for r in range(ROWS):
            if board[r][c] == piece and board[r][c+1] == piece and board[r][c+2] == piece and board[r][c+3] == piece:
                return True
    # Check vertical locations
    for c in range(COLS):
        for r in range(ROWS - 3):
            if board[r][c] == piece and board[r+1][c] == piece and board[r+2][c] == piece and board[r+3][c] == piece:
                return True
    # Check positively sloped diagonals
    for c in range(COLS - 3):
        for r in range(ROWS - 3):
            if board[r][c] == piece and board[r+1][c+1] == piece and board[r+2][c+2] == piece and board[r+3][c+3] == piece:
                return True
    # Check negatively sloped diagonals
    for c in range(COLS - 3):
        for r in range(3, ROWS):
            if board[r][c] == piece and board[r-1][c+1] == piece and board[r-2][c+2] == piece and board[r-3][c+3] == piece:
                return True
    return False

# --- Heuristic Scoring for AI ---
def evaluate_window(window, piece):
    score = 0
    opp_piece = PLAYER_PIECE if piece == AI_PIECE else AI_PIECE

    if window.count(piece) == 4:
        score += 1000
    elif window.count(piece) == 3 and window.count(EMPTY) == 1:
        score += 50
    elif window.count(piece) == 2 and window.count(EMPTY) == 2:
        score += 10

    if window.count(opp_piece) == 3 and window.count(EMPTY) == 1:
        score -= 80  # Heavily penalise letting the opponent get 3-in-a-row

    return score

def score_position(board, piece):
    score = 0

    # Score center column (strategic preference)
    center_array = [board[r][COLS // 2] for r in range(ROWS)]
    center_count = center_array.count(piece)
    score += center_count * 15

    # Score Horizontal
    for r in range(ROWS):
        row_array = [board[r][c] for c in range(COLS)]
        for c in range(COLS - 3):
            window = row_array[c:c + WINDOW_LENGTH]
            score += evaluate_window(window, piece)

    # Score Vertical
    for c in range(COLS):
        col_array = [board[r][c] for r in range(ROWS)]
        for r in range(ROWS - 3):
            window = col_array[r:r + WINDOW_LENGTH]
            score += evaluate_window(window, piece)

    # Score positive diagonal
    for r in range(ROWS - 3):
        for c in range(COLS - 3):
            window = [board[r + i][c + i] for i in range(WINDOW_LENGTH)]
            score += evaluate_window(window, piece)

    # Score negative diagonal
    for r in range(3, ROWS):
        for c in range(COLS - 3):
            window = [board[r - i][c + i] for i in range(WINDOW_LENGTH)]
            score += evaluate_window(window, piece)

    return score

def get_valid_locations(board):
    return [c for c in range(COLS) if is_valid_location(board, c)]

def is_terminal_node(board):
    return check_win(board, PLAYER_PIECE) or check_win(board, AI_PIECE) or len(get_valid_locations(board)) == 0

# --- Minimax Algorithm with Alpha-Beta Pruning ---
def minimax(board, depth, alpha, beta, maximizingPlayer):
    valid_locations = get_valid_locations(board)
    is_terminal = is_terminal_node(board)
    
    if depth == 0 or is_terminal:
        if is_terminal:
            if check_win(board, AI_PIECE):
                return (None, 100000000000000)
            elif check_win(board, PLAYER_PIECE):
                return (None, -100000000000000)
            else:  # Game is over, no more moves
                return (None, 0)
        else:  # Depth is 0
            return (None, score_position(board, AI_PIECE))

    if maximizingPlayer:
        value = -math.inf
        column = valid_locations[0]
        for col in valid_locations:
            row = get_next_open_row(board, col)
            b_copy = copy.deepcopy(board)
            drop_piece(b_copy, row, col, AI_PIECE)
            new_score = minimax(b_copy, depth - 1, alpha, beta, False)[1]
            if new_score > value:
                value = new_score
                column = col
            alpha = max(alpha, value)
            if alpha >= beta:
                break
        return column, value

    else:  # Minimizing player
        value = math.inf
        column = valid_locations[0]
        for col in valid_locations:
            row = get_next_open_row(board, col)
            b_copy = copy.deepcopy(board)
            drop_piece(b_copy, row, col, PLAYER_PIECE)
            new_score = minimax(b_copy, depth - 1, alpha, beta, True)[1]
            if new_score < value:
                value = new_score
                column = col
            beta = min(beta, value)
            if alpha >= beta:
                break
        return column, value

# --- Main Gameplay Loop ---
def main():
    board = create_board()
    print_board(board)
    game_over = False
    turn = 0  # 0 for Player, 1 for AI

    while not game_over:
        # Player Turn
        if turn == 0:
            try:
                col = int(input("Your turn (X). Choose a column (0-6): "))
                if col < 0 or col > 6:
                    print("Out of bounds! Choose 0-6.")
                    continue
                
                if is_valid_location(board, col):
                    row = get_next_open_row(board, col)
                    drop_piece(board, row, col, PLAYER_PIECE)

                    if check_win(board, PLAYER_PIECE):
                        print_board(board)
                        print("Congratulations! Player wins!")
                        game_over = True
                        break
                    
                    turn = 1
                    print_board(board)
                else:
                    print("Column full! Try another one.")
            except ValueError:
                print("Please enter a valid integer.")

        # AI Turn
        else:
            print("AI (O) is thinking...")
            col, minimax_score = minimax(board, MAX_DEPTH, -math.inf, math.inf, True)

            if col is not None and is_valid_location(board, col):
                row = get_next_open_row(board, col)
                drop_piece(board, row, col, AI_PIECE)
                print(f"AI chooses column {col}")

                if check_win(board, AI_PIECE):
                    print_board(board)
                    print("AI wins! Game over.")
                    game_over = True
                    break
                
                turn = 0
                print_board(board)
            else:
                if len(get_valid_locations(board)) == 0:
                    print("It's a draw!")
                    game_over = True

if __name__ == "__main__":
    main()
